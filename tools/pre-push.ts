const PROTECTED_REFS: ReadonlySet<string> = new Set(["refs/heads/main", "refs/heads/develop"]);
const BRANCH_PATTERN =
  /^(cla-\d+-.+|(feat|fix|docs|refactor|chore|test|ci|perf|build|style|revert)\/.+|renovate\/.+|worktree-.+)$/;
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

function branchName(ref: string): string {
  return ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : ref;
}

/** Maps a finished gate to a push-blocking code; a signal-killed gate reports a null exit code at runtime, so it blocks with 1. */
export function gateFailureCode(result: { success: boolean; exitCode: number }): number {
  return result.success ? 0 : result.exitCode || 1;
}

function runGates(): number {
  for (const command of GATES) {
    const result = Bun.spawnSync([...command], { stdout: "inherit", stderr: "inherit" });
    const code = gateFailureCode(result);
    if (code !== 0) return code;
  }
  return 0;
}

async function main(): Promise<number> {
  const pushes = parsePushLines(await Bun.stdin.text());
  for (const { localRef, remoteRef } of pushes) {
    const subject = localRef === "(delete)" ? branchName(remoteRef) : branchName(localRef);
    const verdict = checkPush(remoteRef, subject);
    if (!verdict.ok) {
      console.error(`pre-push: ${verdict.reason}`);
      return 1;
    }
  }
  return runGates();
}

if (import.meta.main) {
  process.exitCode = await main();
}
