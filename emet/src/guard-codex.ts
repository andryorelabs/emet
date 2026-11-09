import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import type { AgentHostName } from "./agenthost";
import { writeApproval } from "./approve";
import { isObject } from "./narrow";

/** The tool input `emet guard` evaluates; `paths` lists the files a patch touches. */
export type PreToolUseInput = {
  readonly tool_name?: string;
  readonly cwd?: string;
  readonly tool_input?: Record<string, unknown>;
  readonly paths?: string[];
};

export type GuardDecision =
  | { readonly decision: "allow" }
  | { readonly decision: "deny"; readonly reason: string };

const ALLOW: GuardDecision = { decision: "allow" };
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/;
const MUTATING_TOOLS = new Set([
  "Bash",
  "apply_patch",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);
const READ_ONLY_COMMANDS = new Set(["ls", "cat", "rg", "grep", "head", "tail", "wc", "pwd"]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show", "rev-parse"]);
const EXECUTING_OPTIONS = /^--(?:pre|output|ext-diff|textconv|exec)(?:=|$)/;
const SHELL_OPERATORS = /[;&|<>`\n]|\$\(/;
const APPROVE_LINE = /^approve ([A-Za-z0-9_-]+)$/;
const WORKTREE_MARKERS: Record<AgentHostName, string> = {
  claude: ".claude/worktrees/agent-",
  codex: ".emet/worktrees/agent-",
};

/**
 * Whether `directory` is inside an agent worktree of the given Agent host.
 * The Codex adapter is not registered with `resolveAgentHost` yet, so the
 * marker lives here (`unverified` layout until the adapter lands).
 */
export function isAgentWorktreeFor(host: AgentHostName, directory: string | undefined): boolean {
  return typeof directory === "string" && directory.includes(WORKTREE_MARKERS[host]);
}

/** Resolves the Agent host from `EMET_AGENT_HOST`; anything but `codex` is Claude. */
export function detectAgentHost(env: NodeJS.ProcessEnv = process.env): AgentHostName {
  return env["EMET_AGENT_HOST"] === "codex" ? "codex" : "claude";
}

/** The file paths named by `*** Add/Update/Delete File:` (and `Move to:`) patch headers. */
export function parseApplyPatchPaths(patch: string): string[] {
  const found: string[] = [];
  for (const line of patch.split("\n")) {
    const match = PATCH_HEADER.exec(line);
    if (match?.[1] !== undefined && !found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

function optionalString(record: Record<string, unknown>, key: string): { [K in string]?: string } {
  const value = record[key];
  return typeof value === "string" ? { [key]: value } : {};
}

/**
 * Normalizes a hook payload. Claude input maps field for field; on Codex an
 * `apply_patch` payload also gains `paths`, parsed from `tool_input.command`.
 */
export function normalizeHookInput(raw: unknown, host: AgentHostName): PreToolUseInput {
  if (!isObject(raw)) return {};
  const base: PreToolUseInput = {
    ...optionalString(raw, "tool_name"),
    ...optionalString(raw, "cwd"),
    ...(isObject(raw.tool_input) ? { tool_input: raw.tool_input } : {}),
  };
  if (host !== "codex" || base.tool_name !== "apply_patch") return base;
  const patch = base.tool_input?.["command"];
  return typeof patch === "string" ? { ...base, paths: parseApplyPatchPaths(patch) } : base;
}

/** Codex `PreToolUse` output: a deny carries no `continue`, `stopReason` or `suppressOutput`. */
export function formatCodexPreToolUseOutput(decision: GuardDecision): string | null {
  if (decision.decision === "allow") return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason,
    },
  });
}

function pendingApprovalIds(runsDir: string): string[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^spec[A-Za-z0-9_-]+$/.test(entry.name))
    .filter((entry) => !existsSync(path.join(runsDir, entry.name, "approval.json")))
    .map((entry) => entry.name.slice("spec".length))
    .toSorted();
}

function isUnderDraft(target: string, input: PreToolUseInput, runsDir: string): boolean {
  const relative = path.relative(runsDir, path.resolve(input.cwd ?? runsDir, target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  const parts = relative.split(path.sep);
  const draftIndex = parts.indexOf("draft");
  return draftIndex >= 1 && draftIndex < parts.length - 1;
}

function isReadOnlyBash(command: unknown): boolean {
  if (typeof command !== "string" || SHELL_OPERATORS.test(command)) return false;
  const words = command.trim().split(/\s+/);
  const [program, subcommand] = words;
  if (program === undefined) return false;
  if (words.some((word) => EXECUTING_OPTIONS.test(word))) return false;
  if (READ_ONLY_COMMANDS.has(program)) return true;
  return program === "git" && subcommand !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(subcommand);
}

/** A shell word after quote removal. */
type ShellWord = { readonly text: string };

/** Thrown by the lexer on unbalanced quotes or substitutions. */
class UnparseableCommand extends Error {}

const CONTROL_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash"]);
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--super-prefix",
]);
const WRAPPER_OPTIONS_WITH_VALUE: Record<string, ReadonlySet<string>> = {
  sudo: new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"]),
  env: new Set(["-u", "-C", "-S"]),
  nice: new Set(["-n"]),
  timeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
  xargs: new Set(["-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a"]),
};
const POSITIONAL_WRAPPERS = new Set(["timeout"]);
const PLAIN_WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time", "stdbuf"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The index just past the `)` closing a `$(` that opens at `start`. */
function closingParenthesis(text: string, start: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      else if (character === "\\" && quote === '"') index++;
      continue;
    }
    if (character === "\\") index++;
    else if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth++;
    else if (character === ")" && --depth === 0) return index + 1;
  }
  throw new UnparseableCommand("unbalanced $(");
}

/**
 * Splits shell text into simple commands of words, removing quotes. Command
 * and backtick substitutions are collected into `nested` for a separate pass.
 */
function lexShell(text: string, nested: string[]): ShellWord[][] {
  const commands: ShellWord[][] = [];
  let words: ShellWord[] = [];
  let current = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push({ text: current });
    current = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === "\\") {
      if (text[index + 1] !== "\n") current += text[index + 1] ?? "";
      index++;
      inWord = true;
    } else if (character === "'") {
      const end = text.indexOf("'", index + 1);
      if (end === -1) throw new UnparseableCommand("unbalanced '");
      current += text.slice(index + 1, end);
      index = end;
      inWord = true;
    } else if (character === '"') {
      let end = index + 1;
      for (; end < text.length && text[end] !== '"'; end++) {
        if (text[end] === "\\") {
          current += text[end + 1] ?? "";
          end++;
        } else if (text.startsWith("$(", end)) {
          const close = closingParenthesis(text, end + 2);
          nested.push(text.slice(end + 2, close - 1));
          current += "$";
          end = close - 1;
        } else if (text[end] === "`") {
          const close = text.indexOf("`", end + 1);
          if (close === -1) throw new UnparseableCommand("unbalanced `");
          nested.push(text.slice(end + 1, close));
          end = close;
        } else current += text[end];
      }
      if (end >= text.length) throw new UnparseableCommand('unbalanced "');
      index = end;
      inWord = true;
    } else if (text.startsWith("$(", index)) {
      const close = closingParenthesis(text, index + 2);
      nested.push(text.slice(index + 2, close - 1));
      current += "$";
      inWord = true;
      index = close - 1;
    } else if (character === "`") {
      const close = text.indexOf("`", index + 1);
      if (close === -1) throw new UnparseableCommand("unbalanced `");
      nested.push(text.slice(index + 1, close));
      current += "$";
      inWord = true;
      index = close;
    } else if (/[;&|()\n]/.test(character)) {
      endCommand();
    } else if (/\s/.test(character)) {
      endWord();
    } else {
      current += character;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

/** Drops leading assignments, control keywords and wrappers such as `sudo` or `env`. */
function stripCommandPrefix(words: readonly ShellWord[]): ShellWord[] {
  let index = 0;
  while (index < words.length) {
    const word = words[index]!.text;
    if (CONTROL_KEYWORDS.has(word) || ASSIGNMENT.test(word)) {
      index++;
      continue;
    }
    const program = path.basename(word);
    const valued = WRAPPER_OPTIONS_WITH_VALUE[program];
    if (!PLAIN_WRAPPERS.has(program) && valued === undefined) break;
    index++;
    while (index < words.length && words[index]!.text.startsWith("-")) {
      index += valued?.has(words[index]!.text) === true ? 2 : 1;
    }
    if (program === "env") {
      while (index < words.length && ASSIGNMENT.test(words[index]!.text)) index++;
    }
    if (POSITIONAL_WRAPPERS.has(program)) index++;
  }
  return words.slice(index);
}

/** Whether `git <args>` (global options first) runs the `push` subcommand. */
function gitArgumentsPush(args: readonly ShellWord[]): boolean {
  let index = 0;
  while (index < args.length) {
    const word = args[index]!.text;
    if (!word.startsWith("-")) return word === "push";
    if (GIT_OPTIONS_WITH_VALUE.has(word)) {
      const value = args[index + 1]?.text ?? "";
      if (word === "-c" && /^alias\.[^=]*=.*\bpush\b/i.test(value)) return true;
      index += 2;
    } else index++;
  }
  return false;
}

/** Whether one simple command runs `git push`, directly or through a nested shell. */
function simpleCommandPushes(words: readonly ShellWord[]): boolean {
  const [program, ...args] = stripCommandPrefix(words);
  if (program === undefined) return false;
  const name = path.basename(program.text);
  if (name === "git-push") return true;
  if (name === "git") return gitArgumentsPush(args);
  if (name === "eval") return isGitPushCommand(args.map((arg) => arg.text).join(" "));
  if (SHELLS.has(name)) {
    const flagIndex = args.findIndex((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg.text));
    const script = flagIndex === -1 ? undefined : args[flagIndex + 1];
    return script !== undefined && isGitPushCommand(script.text);
  }
  return program.text.includes("$") && args.some((arg) => arg.text === "push");
}

/**
 * Whether a shell command runs `git push` in any argv form: chained with
 * `&&`, `;`, `|` or newlines, inside `$(...)` or backticks, behind
 * assignments or wrappers (`env`, `sudo`, `command`, `xargs`, ...), with git
 * global options (`-C`, `--git-dir`, `-c`) or through `sh -c`/`eval`.
 * Best effort, and fails closed: text that cannot be lexed is a push when
 * the words `git` and `push` both appear in it.
 */
export function isGitPushCommand(command: string): boolean {
  const nested: string[] = [];
  let commands: ShellWord[][];
  try {
    commands = lexShell(command, nested);
  } catch (error) {
    if (!(error instanceof UnparseableCommand)) throw error;
    return /\bgit\b/.test(command) && /\bpush\b/.test(command);
  }
  return commands.some(simpleCommandPushes) || nested.some(isGitPushCommand);
}

function mutationTargets(input: PreToolUseInput): string[] | null {
  if (input.tool_name === "apply_patch") return input.paths ?? null;
  if (input.tool_name === "Bash") return null;
  const target = input.tool_input?.["file_path"] ?? input.tool_input?.["notebook_path"];
  return typeof target === "string" ? [target] : null;
}

/**
 * The single approval gate. While a `spec<id>` run directory under `runsDir`
 * has no `approval.json`, every mutation is denied except writes under
 * `runs/<run>/draft/`. Fails closed: an unparseable mutation is denied.
 * Before the gate, a Bash call that runs `git push` is denied whatever the
 * approval state (ADR-0022: the guard is the boundary outside the sandbox).
 */
export function evaluateApprovalGate(input: PreToolUseInput, runsDir: string): GuardDecision {
  const command = input.tool_input?.["command"];
  if (input.tool_name === "Bash" && typeof command === "string" && isGitPushCommand(command)) {
    return { decision: "deny", reason: "git push is not allowed" };
  }
  const [pendingId] = pendingApprovalIds(runsDir);
  if (pendingId === undefined) return ALLOW;
  if (input.tool_name === undefined || !MUTATING_TOOLS.has(input.tool_name)) return ALLOW;
  if (input.tool_name === "Bash" && isReadOnlyBash(input.tool_input?.["command"])) return ALLOW;

  const targets = mutationTargets(input);
  if (
    targets !== null &&
    targets.length > 0 &&
    targets.every((target) => isUnderDraft(target, input, runsDir))
  ) {
    return ALLOW;
  }
  return { decision: "deny", reason: `not approved: send approve ${pendingId}` };
}

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Creates `<runsDir>/spec<id>/approval.json` (same hashing as `emet approve`)
 * when a prompt line is exactly `approve <id>`. Only the user's prompt reaches
 * this function, never tool output. Any missing spec or tickets file leaves
 * the gate closed.
 */
export function handleUserPromptSubmit(input: unknown, runsDir: string): { approved: boolean } {
  const prompt = isObject(input) ? input["prompt"] : undefined;
  if (typeof prompt !== "string") return { approved: false };
  for (const line of prompt.split("\n")) {
    const id = APPROVE_LINE.exec(line.trim())?.[1];
    if (id === undefined) continue;
    const runDirectory = path.join(runsDir, `spec${id}`);
    const specPath = firstExisting([
      path.join(runDirectory, "spec.md"),
      path.join(runDirectory, "draft", "spec.md"),
    ]);
    const ticketsPath = firstExisting([
      path.join(runDirectory, "tickets.json"),
      path.join(runDirectory, "draft", "tickets.json"),
    ]);
    if (specPath === undefined || ticketsPath === undefined) continue;
    writeApproval({
      approvalPath: path.join(runDirectory, "approval.json"),
      specPath,
      ticketsPath,
    });
    return { approved: true };
  }
  return { approved: false };
}
