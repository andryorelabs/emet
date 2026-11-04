import os from "node:os";
import path from "node:path";

const SEGMENT_SEPARATOR = /&&|\|\||[;|&\n]/;

const WRAPPER_COMMANDS = new Set(["sudo", "command", "xargs", "env", "nohup", "time", "exec"]);

const SHELL_COMMANDS = new Set(["sh", "bash", "zsh", "dash"]);

const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const UNRESOLVABLE_TARGET = /[$`~]/;

const SCRATCH_DIRECTORY_NAME = ".forge";

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
 * temp directories and the repo's own `.forge` runtime-state directory.
 */
function scratchRoots(cwd: string): string[] {
  return [...new Set(["/tmp", os.tmpdir(), path.resolve(cwd, SCRATCH_DIRECTORY_NAME)])];
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
  return scratchRoots(cwd).some((root) => resolved.startsWith(`${root}/`));
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
 * Finds the real command word of a segment, skipping `sudo`, `env VAR=x`,
 * `xargs` and similar wrappers, and returns the tokens from it onward.
 */
function commandTokens(tokens: readonly string[]): string[] {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    const isOption = token.startsWith("-") && index > 0;
    if (
      WRAPPER_COMMANDS.has(path.basename(token)) ||
      ENVIRONMENT_ASSIGNMENT.test(token) ||
      isOption
    ) {
      index += 1;
    } else {
      break;
    }
  }
  return tokens.slice(index);
}

function isSegmentAllowed(segment: string, cwd: string): boolean {
  const [commandWord = "", ...rest] = commandTokens(tokenize(segment));
  const commandName = path.basename(commandWord);
  if (SHELL_COMMANDS.has(commandName)) {
    const scriptIndex = rest.indexOf("-c") + 1;
    const script = scriptIndex > 0 ? rest[scriptIndex] : undefined;
    return script === undefined || isAllowedRemoval(script, cwd);
  }
  if (commandName !== "rm") {
    return true;
  }
  const flags: string[] = [];
  const targets: string[] = [];
  let optionsEnded = false;
  for (const argument of rest) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument.startsWith("-")) {
      flags.push(argument);
    } else {
      targets.push(argument);
    }
  }
  if (!isRecursiveForce(flags)) {
    return true;
  }
  return targets.every((target) => isInsideScratch(target, cwd));
}

/**
 * Whether a Bash command is free of recursive force-deletes outside the
 * scratch area. Every `;`, `&&`, `||`, pipe and newline separated segment is
 * checked, including `rm` behind `sudo`, `xargs`, `env` and `sh -c`. A
 * recursive force `rm` is allowed only when every target resolves strictly
 * below `/tmp`, the OS temp directory, or `<cwd>/.forge`. Commands that are
 * not `rm` (including `git rm`) and `rm` without both recursion and force
 * pass through.
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
        "recursive force-delete outside the scratch area (/tmp, the OS temp dir, .forge) is blocked; delete specific paths or ask the user",
    },
  });
}

if (import.meta.main) {
  const output = decideRemovalGuard(await Bun.stdin.text());
  if (output !== null) {
    process.stdout.write(`${output}\n`);
  }
}
