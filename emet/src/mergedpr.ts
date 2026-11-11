/**
 * Deletes local branches whose pull request already merged. `emet cleanup`
 * decides worker branches by ticket state and content, which leaves two gaps:
 * a branch that names no ticket (the wave's integration branch, a release or
 * fix branch) is never looked at, and a squash-merged branch stops looking
 * merged once trunk moves on. The evidence used here does not decay: GitHub
 * holds a merged pull request whose head branch has this name and whose head
 * commit is exactly the local tip. That commit was merged, so the local
 * branch holds nothing else.
 */
import { existsSync } from "node:fs";

import type { AgentHost } from "./agenthost";
import type { ForgeConfig } from "./config";
import { BINARY } from "./names";
import { isForgeShapedBranch, listWorktreeEntries, type WorktreeEntry } from "./worktrees";

export type LocalBranch = {
  readonly name: string;
  readonly sha: string;
};

export type MergedPullRequestRunner = (
  branch: string,
) => Promise<{ readonly exitCode: number; readonly stdout: string }>;

const runGithubPullRequestList: MergedPullRequestRunner = async (branch) => {
  const result =
    await Bun.$`gh pr list --state merged --head ${branch} --json number,headRefOid --limit 30`
      .nothrow()
      .quiet();
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
};

/**
 * The number of the merged pull request, in `gh pr list --json
 * number,headRefOid` output, whose head commit is `tipSha`, or `null` when
 * none is. Output it cannot interpret is `null` too: an unreadable answer must
 * never count as merged.
 */
export function parseMergedPullRequest(stdout: string, tipSha: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items: readonly unknown[] = parsed;
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    if (!("number" in item) || !("headRefOid" in item)) continue;
    if (typeof item.number === "number" && item.headRefOid === tipSha) return item.number;
  }
  return null;
}

/**
 * Looks up the merged pull request that landed exactly `tipSha` from a head
 * branch named `branch`. A `gh` failure (missing, offline, unauthenticated)
 * answers `null`, so nothing is ever deleted on a failed read.
 */
export async function findMergedPullRequest(
  branch: string,
  tipSha: string,
  run: MergedPullRequestRunner = runGithubPullRequestList,
): Promise<number | null> {
  let result: { readonly exitCode: number; readonly stdout: string };
  try {
    result = await run(branch);
  } catch {
    return null;
  }
  if (result.exitCode !== 0) return null;
  return parseMergedPullRequest(result.stdout, tipSha);
}

/**
 * Parses `git for-each-ref refs/heads '--format=%(refname:short)%09%(objectname)'`.
 */
export function parseLocalBranches(output: string): LocalBranch[] {
  const branches: LocalBranch[] = [];
  for (const line of output.split("\n")) {
    const [name, sha] = line.split("\t");
    if (name && sha) branches.push({ name: name.trim(), sha: sha.trim() });
  }
  return branches;
}

async function listLocalBranches(): Promise<LocalBranch[]> {
  const output =
    await Bun.$`git for-each-ref refs/heads '--format=%(refname:short)%09%(objectname)'`.text();
  return parseLocalBranches(output);
}

export type MergedBranchPlan =
  | { readonly action: "delete"; readonly branch: string; readonly pullRequest: number }
  | {
      readonly action: "remove-worktree";
      readonly branch: string;
      readonly pullRequest: number;
      readonly directory: string;
    }
  | {
      readonly action: "keep";
      readonly branch: string;
      readonly pullRequest: number;
      readonly reason: string;
    };

export type MergedBranchInput = {
  readonly branch: string;
  readonly pullRequest: number;
  /** The worktree that has the branch checked out, if any. */
  readonly entry: WorktreeEntry | undefined;
  readonly isAgentWorktree: boolean;
  readonly isDirty: boolean;
};

/**
 * What to do with one branch whose pull request merged. A branch nothing has
 * checked out is deleted. One checked out in a worktree goes only together
 * with that worktree, and only when the worktree is the agent's own (under
 * the host's agent worktree directory), unlocked and clean; a lock means
 * someone still holds it and a dirty tree holds work no pull request has.
 */
export function planMergedBranch(input: MergedBranchInput): MergedBranchPlan {
  const { branch, pullRequest, entry } = input;
  if (entry === undefined) return { action: "delete", branch, pullRequest };
  const keep = (reason: string): MergedBranchPlan => ({
    action: "keep",
    branch,
    pullRequest,
    reason: `${entry.directory}: ${reason}`,
  });
  if (!input.isAgentWorktree) return keep("checked out outside the agent worktree directory");
  if (entry.lockedReason !== null) return keep("worktree is locked");
  if (input.isDirty) return keep("worktree has uncommitted changes");
  return { action: "remove-worktree", branch, pullRequest, directory: entry.directory };
}

/**
 * Branch names the sweep never considers: trunk, the remote's default branch,
 * and whatever the main worktree and the working directory have checked out.
 */
export function protectedBranchNames(
  trunk: string,
  defaultBranch: string | null,
  mainBranch: string | null,
  currentBranch: string | null,
): Set<string> {
  const names = new Set<string>([trunk]);
  for (const name of [defaultBranch, mainBranch, currentBranch]) {
    if (name) names.add(name);
  }
  return names;
}

async function readTrimmed(
  command: Promise<{ exitCode: number; stdout: Buffer }>,
): Promise<string | null> {
  const result = await command;
  const text = result.stdout.toString().trim();
  return result.exitCode === 0 && text.length > 0 ? text : null;
}

async function resolveDefaultBranch(remote: string): Promise<string | null> {
  const reference = await readTrimmed(
    Bun.$`git symbolic-ref --short refs/remotes/${remote}/HEAD`.nothrow().quiet(),
  );
  return reference === null ? null : reference.slice(remote.length + 1);
}

async function isDirty(directory: string): Promise<boolean> {
  if (!existsSync(directory)) return false;
  const result = await Bun.$`git -C ${directory} status --porcelain`.nothrow().quiet();
  return result.exitCode !== 0 || result.stdout.toString().trim().length > 0;
}

async function removeWorktree(directory: string): Promise<string | null> {
  const result = await Bun.$`git worktree remove ${directory}`.nothrow().quiet();
  return result.exitCode === 0 ? null : `${directory} — ${result.stderr.toString().trim()}`;
}

async function deleteLocalBranch(branch: string): Promise<string | null> {
  const result = await Bun.$`git branch -D ${branch}`.nothrow().quiet();
  return result.exitCode === 0 ? null : `${branch} — ${result.stderr.toString().trim()}`;
}

export type MergedSweepContext = {
  readonly config: ForgeConfig;
  readonly host: AgentHost;
  readonly dryRun: boolean;
  readonly findMergedPullRequest?: (branch: string, tipSha: string) => Promise<number | null>;
};

export type MergedSweepResult = {
  readonly deleted: readonly string[];
  readonly kept: readonly string[];
  readonly failures: readonly string[];
};

/**
 * Plans every local branch that names no ticket against its merged pull
 * request. Worker and scaffold branches stay with `emet cleanup`'s own
 * reclaim, which decides them by ticket. With `landing.mode: merge` there are
 * no pull requests, so there is nothing to plan. No mutations.
 */
export async function planMergedBranchSweep(
  context: MergedSweepContext,
): Promise<MergedBranchPlan[]> {
  const { config, host } = context;
  if (config.landing.mode === "merge") return [];
  const lookup = context.findMergedPullRequest ?? findMergedPullRequest;
  const entries = await listWorktreeEntries();
  const currentBranch = await readTrimmed(
    Bun.$`git symbolic-ref --short -q HEAD`.nothrow().quiet(),
  );
  const skipped = protectedBranchNames(
    config.repo.trunk,
    await resolveDefaultBranch(config.repo.remote),
    entries[0]?.branch ?? null,
    currentBranch,
  );
  const plans: MergedBranchPlan[] = [];
  for (const branch of await listLocalBranches()) {
    if (skipped.has(branch.name)) continue;
    if (isForgeShapedBranch(branch.name, config.ticket.branchPrefix)) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: one gh call at a time, output in branch order
    const pullRequest = await lookup(branch.name, branch.sha);
    if (pullRequest === null) continue;
    const entry = entries.find((candidate) => candidate.branch === branch.name);
    plans.push(
      planMergedBranch({
        branch: branch.name,
        pullRequest,
        entry,
        isAgentWorktree: entry !== undefined && host.isAgentWorktree(entry.directory),
        // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: one gh call at a time, output in branch order
        isDirty: entry !== undefined && (await isDirty(entry.directory)),
      }),
    );
  }
  return plans;
}

async function applyPlan(plan: MergedBranchPlan): Promise<string | null> {
  if (plan.action === "keep") return null;
  if (plan.action === "remove-worktree") {
    const failure = await removeWorktree(plan.directory);
    if (failure !== null) return failure;
  }
  return deleteLocalBranch(plan.branch);
}

function describe(plan: MergedBranchPlan): string {
  const suffix = plan.action === "remove-worktree" ? `, with worktree ${plan.directory}` : "";
  return `${plan.branch} (PR #${plan.pullRequest} merged${suffix})`;
}

/**
 * Runs the sweep and prints its report: branches deleted (with the worktree
 * that went with them), merged branches kept and why, and failures. Under
 * `dryRun` nothing is touched and the report says what would go.
 */
export async function sweepMergedBranches(context: MergedSweepContext): Promise<MergedSweepResult> {
  const plans = await planMergedBranchSweep(context);
  const deleted: string[] = [];
  const kept: string[] = [];
  const failures: string[] = [];
  for (const plan of plans) {
    if (plan.action === "keep") {
      kept.push(`${plan.branch} (PR #${plan.pullRequest} merged) — ${plan.reason}`);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: a worktree goes before its branch, output in branch order
    const failure = context.dryRun ? null : await applyPlan(plan);
    if (failure === null) deleted.push(describe(plan));
    else failures.push(failure);
  }
  if (deleted.length > 0) {
    console.log(
      `\n${context.dryRun ? "Would delete" : "Deleted"} ${deleted.length} branch(es) whose pull request merged:`,
    );
    for (const line of deleted) console.log(`  - ${line}`);
  }
  if (kept.length > 0) {
    console.log(`\nKept ${kept.length} merged branch(es) still checked out:`);
    for (const line of kept) console.log(`  - ${line}`);
  }
  if (failures.length > 0) {
    console.log(`\n${BINARY}:cleanup — failed to delete ${failures.length} merged branch(es):`);
    for (const line of failures) console.log(`  - ${line}`);
    process.exitCode = 1;
  }
  return { deleted, kept, failures };
}
