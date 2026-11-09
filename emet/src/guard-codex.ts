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
  const [program, subcommand] = command.trim().split(/\s+/);
  if (program === undefined) return false;
  if (READ_ONLY_COMMANDS.has(program)) return true;
  return program === "git" && subcommand !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(subcommand);
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
 */
export function evaluateApprovalGate(input: PreToolUseInput, runsDir: string): GuardDecision {
  const [pendingId] = pendingApprovalIds(runsDir);
  if (pendingId === undefined) return ALLOW;
  if (input.tool_name === undefined || !MUTATING_TOOLS.has(input.tool_name)) return ALLOW;
  if (input.tool_name === "Bash" && isReadOnlyBash(input.tool_input?.["command"])) return ALLOW;

  const targets = mutationTargets(input);
  if (targets !== null && targets.every((target) => isUnderDraft(target, input, runsDir))) {
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
