import os from "node:os";
import path from "node:path";

const SEGMENT_SEPARATOR = /&&|\|\||[;|&\n()`]/;

const SHELL_COMMANDS = new Set(["sh", "bash", "zsh", "dash"]);

const PRINT_COMMANDS = new Set(["echo", "printf"]);

const UNRESOLVABLE_TARGET = /[$`~]/;

/**
 * Splits one shell segment into words, honouring single and double quotes.
 * Quote characters are dropped; no expansion is performed.
 */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: string | null = null;
  for (const character of segment) {
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      hasToken = true;
    } else if (/\s/.test(character)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
    } else {
      current += character;
      hasToken = true;
    }
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Absolute directories a recursive force-delete may target below: the system
 * temp directories only. Nothing inside the repo is on the list.
 */
function scratchRoots(): string[] {
  return [...new Set(["/tmp", os.tmpdir()])];
}

/**
 * Whether the target resolves strictly below one of the scratch roots. The
 * roots themselves, anything with an expansion (`$`, backtick, `~`) and
 * anything that normalises out of a root are rejected.
 */
function isInsideScratch(target: string, cwd: string): boolean {
  if (UNRESOLVABLE_TARGET.test(target)) {
    return false;
  }
  const resolved = path.resolve(cwd, target);
  return scratchRoots().some((root) => resolved.startsWith(`${root}/`));
}

/**
 * Whether the `rm` arguments request both recursion and force, in any
 * spelling (`-rf`, `-fr`, `-Rf`, `-r -f`, `--recursive --force`).
 */
function isRecursiveForce(flags: readonly string[]): boolean {
  let recursive = false;
  let force = false;
  for (const flag of flags) {
    if (flag === "--recursive") {
      recursive = true;
    } else if (flag === "--force") {
      force = true;
    } else if (/^-[A-Za-z]+$/.test(flag)) {
      recursive ||= /[rR]/.test(flag);
      force ||= flag.includes("f");
    }
  }
  return recursive && force;
}

/**
 * Strips a leading backslash (`\rm` skips aliases) and any directory prefix
 * from a word.
 */
function plainWord(token: string): string {
  return path.basename(token.replace(/^\\+/, ""));
}

/**
 * Index of the first word that is `rm` (not a `git rm` subcommand), wherever
 * it sits in the segment, so wrappers, compound keywords, option values and
 * `find -exec` cannot hide it.
 */
function findRmIndex(tokens: readonly string[]): number {
  return tokens.findIndex(
    (token, index) => plainWord(token) === "rm" && plainWord(tokens[index - 1] ?? "") !== "git",
  );
}

/**
 * The script of the first `sh -c`-style invocation in the segment, or
 * undefined when there is none.
 */
function shellScript(tokens: readonly string[]): string | undefined {
  const shellIndex = tokens.findIndex((token) => SHELL_COMMANDS.has(plainWord(token)));
  if (shellIndex === -1) {
    return undefined;
  }
  const rest = tokens.slice(shellIndex + 1);
  const scriptIndex = rest.indexOf("-c") + 1;
  return scriptIndex > 0 ? rest[scriptIndex] : undefined;
}

function isSegmentAllowed(segment: string, cwd: string): boolean {
  const tokens = tokenize(segment);
  const script = shellScript(tokens);
  if (script !== undefined && !isAllowedRemoval(script, cwd)) {
    return false;
  }
  const rmIndex = findRmIndex(tokens);
  if (rmIndex === -1 || PRINT_COMMANDS.has(plainWord(tokens[0] ?? ""))) {
    return true;
  }
  const flags: string[] = [];
  const targets: string[] = [];
  let optionsEnded = false;
  for (const argument of tokens.slice(rmIndex + 1)) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument.startsWith("-")) {
      flags.push(argument);
    } else if (argument !== "}") {
      targets.push(argument);
    }
  }
  if (!isRecursiveForce(flags)) {
    return true;
  }
  return targets.length > 0 && targets.every((target) => isInsideScratch(target, cwd));
}

/**
 * Whether a Bash command is free of recursive force-deletes outside the
 * scratch area. Every `;`, `&&`, `||`, pipe and newline separated segment is
 * checked, including `rm` behind `sudo`, `xargs`, `env` and `sh -c`. A
 * recursive force `rm` is allowed only when every target resolves strictly
 * below `/tmp` or the OS temp directory. Commands that are not `rm`
 * (including `git rm`) and `rm` without both recursion and force pass through.
 */
export function isAllowedRemoval(command: string, cwd: string): boolean {
  return command.split(SEGMENT_SEPARATOR).every((segment) => isSegmentAllowed(segment, cwd));
}

function readHookInput(hookInput: string): { command: unknown; cwd: string } {
  const parsed: unknown = JSON.parse(hookInput);
  if (typeof parsed !== "object" || parsed === null) {
    return { command: undefined, cwd: process.cwd() };
  }
  const { tool_input: toolInput, cwd } = parsed as { tool_input?: unknown; cwd?: unknown };
  const command =
    typeof toolInput === "object" && toolInput !== null
      ? (toolInput as { command?: unknown }).command
      : undefined;
  return { command, cwd: typeof cwd === "string" ? cwd : process.cwd() };
}

/**
 * The PreToolUse hook output for the JSON a hook receives on stdin: a `deny`
 * decision when the Bash command fails {@link isAllowedRemoval}, or null to
 * stay silent and defer to the normal permission flow.
 */
export function decideRemovalGuard(hookInput: string): string | null {
  const { command, cwd } = readHookInput(hookInput);
  if (typeof command !== "string" || isAllowedRemoval(command, cwd)) {
    return null;
  }
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "recursive force-delete outside the scratch area (/tmp, the OS temp dir) is blocked; delete specific paths or ask the user",
    },
  });
}

if (import.meta.main) {
  const output = decideRemovalGuard(await Bun.stdin.text());
  if (output !== null) {
    process.stdout.write(`${output}\n`);
  }
}
