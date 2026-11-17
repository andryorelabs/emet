const PROTECTED_REFS: ReadonlySet<string> = new Set(["refs/heads/main", "refs/heads/develop"]);
const SLUG = "[a-z0-9._-]+";
const BRANCH_PATTERN = new RegExp(
  `^(cla-\\d+-${SLUG}|(feat|fix|docs|refactor|chore|test|ci|perf|build|style|revert|renovate)/${SLUG}(/${SLUG})*|worktree-${SLUG})$`,
);
const TAG_PREFIX = "refs/tags/";
const BRANCH_PREFIX = "refs/heads/";
const GATES: readonly (readonly string[])[] = [
  ["bun", "run", "typecheck"],
  ["bun", "run", "format:check"],
];

export interface PushVerdict {
  ok: boolean;
  reason?: string;
}

/** Decides whether pushing `localBranch` to `remoteRef` is allowed. */
export function checkPush(remoteRef: string, localBranch: string): PushVerdict {
  if (remoteRef.startsWith(TAG_PREFIX)) return { ok: true };
  if (PROTECTED_REFS.has(remoteRef)) {
    return { ok: false, reason: `pushing to ${remoteRef} is blocked; open a pull request instead` };
  }
  if (!BRANCH_PATTERN.test(localBranch)) {
    return {
      ok: false,
      reason: `branch "${localBranch}" does not match ${BRANCH_PATTERN.source}`,
    };
  }
  return { ok: true };
}

/** Parses the `<local ref> <local sha> <remote ref> <remote sha>` lines git feeds a pre-push hook. */
export function parsePushLines(input: string): { localRef: string; remoteRef: string }[] {
  return input
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length >= 3)
    .map(([localRef = "", , remoteRef = ""]) => ({ localRef, remoteRef }));
}

/** True when at least one pushed line updates a branch; delete-only and tag-only pushes need no gates. */
export function pushNeedsGates(lines: readonly { localRef: string; remoteRef: string }[]): boolean {
  return lines.some(
    ({ localRef, remoteRef }) => remoteRef.startsWith(BRANCH_PREFIX) && localRef !== "(delete)",
  );
}

function branchName(ref: string): string {
  return ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : ref;
}

/** Maps a finished gate to a push-blocking code; a signal-killed gate reports a null exit code at runtime, so it blocks with 1. */
export function gateFailureCode(result: { success: boolean; exitCode: number }): number {
  return result.success ? 0 : result.exitCode || 1;
}

/** Runs each gate in order and returns the first failing code, or 0 when all pass. */
export function runGates(gates: readonly (readonly string[])[] = GATES): number {
  for (const command of gates) {
    const result = Bun.spawnSync([...command], { stdout: "inherit", stderr: "inherit" });
    const code = gateFailureCode(result);
    if (code !== 0) return code;
  }
  return 0;
}

/**
 * Decides a push from the lines git feeds the hook, then runs the gates when a branch is updated.
 * @param input - The hook's stdin text.
 * @param gates - The gate commands to run; defaults to typecheck and format check.
 * @returns The hook's exit code.
 */
export function runPrePush(input: string, gates: readonly (readonly string[])[] = GATES): number {
  const pushes = parsePushLines(input);
  for (const { localRef, remoteRef } of pushes) {
    const subject = localRef === "(delete)" ? branchName(remoteRef) : branchName(localRef);
    const verdict = checkPush(remoteRef, subject);
    if (!verdict.ok) {
      console.error(`pre-push: ${verdict.reason}`);
      return 1;
    }
  }
  return pushNeedsGates(pushes) ? runGates(gates) : 0;
}

if (import.meta.main) process.exitCode = runPrePush(await Bun.stdin.text());
