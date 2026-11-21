/**
 * `emet spec-branch sync|land`: merge trunk into `spec/<id>` and land the
 * spec branch once.
 *
 * `sync` merges trunk in with a merge commit, never a rebase, and stops on a
 * conflict leaving the branch untouched. `land` runs the sync, then in `pr`
 * mode pushes the branch and opens one PR merged with
 * `landing.specMergeMethod` (a merge commit by default), or in
 * `merge` mode merges into local trunk with `--no-ff` and never pushes. It
 * journals `spec.land`.
 */

import { realpath } from "node:fs/promises";
import path from "node:path";

import { realGh, waitForChecks, type WaitForChecksDeps } from "./ci";
import { exitCodes } from "./exit-codes";
import { appendEvent } from "./journal";
import { errorMessage } from "./narrow";
import {
  readSpecBranchState,
  specBranchName,
  type SpecBranchContext,
  type SpecBranchState,
} from "./specbranch";

class SpecLandingRefusedError extends Error {}

interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function git(cwd: string, ...args: string[]): Promise<GitResult> {
  const result = await Bun.$`git -C ${cwd} ${args}`.nothrow().quiet();
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

async function requireGit(cwd: string, ...args: string[]): Promise<string> {
  const result = await git(cwd, ...args);
  if (result.exitCode !== 0) {
    throw new SpecLandingRefusedError(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function checkedOutHolder(root: string, branch: string): Promise<string | undefined> {
  const listing = await requireGit(root, "worktree", "list", "--porcelain");
  let directory = "";
  for (const line of listing.split("\n")) {
    if (line.startsWith("worktree ")) directory = line.slice("worktree ".length);
    else if (line === `branch refs/heads/${branch}`) return directory;
  }
  return undefined;
}

async function requireState(context: SpecBranchContext): Promise<SpecBranchState> {
  const state = await readSpecBranchState(context.root, context.spec);
  if (state === null) {
    throw new SpecLandingRefusedError(`${specBranchName(context.spec)} does not exist`);
  }
  return state;
}

interface TrialMerge {
  tree: string;
  conflicts: string[];
}

async function trialMerge(root: string, tip: string, trunk: string): Promise<TrialMerge> {
  const trial = await git(root, "merge-tree", "--write-tree", "--name-only", tip, trunk);
  const lines = trial.stdout.split("\n");
  const tree = lines[0] ?? "";
  if (trial.exitCode === 0) return { tree, conflicts: [] };
  if (trial.exitCode !== 1) {
    throw new SpecLandingRefusedError(`git merge-tree failed: ${trial.stderr}`);
  }
  const blank = lines.indexOf("");
  const paths = lines.slice(1, blank === -1 ? undefined : blank).filter((line) => line.length > 0);
  return { tree, conflicts: paths.length > 0 ? paths : ["(unknown paths)"] };
}

async function mergeTrunkIntoSpecBranch(context: SpecBranchContext): Promise<string> {
  const { root, spec, trunk, config } = context;
  const branch = specBranchName(spec);
  if (config.landing.mode !== "merge") {
    await git(root, "fetch", config.repo.remote, config.repo.trunk);
  }
  const state = await requireState(context);
  const contained = await git(root, "merge-base", "--is-ancestor", trunk, branch);
  if (contained.exitCode === 0) return state.tip;
  const holder = await checkedOutHolder(root, branch);
  if (holder !== undefined && path.resolve(holder) !== path.resolve(root)) {
    throw new SpecLandingRefusedError(
      `${branch} is checked out in ${holder}; run from that checkout's main worktree or switch it away first`,
    );
  }
  if (holder !== undefined) {
    const dirty = await requireGit(root, "status", "--porcelain", "--untracked-files=no");
    if (dirty.length > 0) {
      throw new SpecLandingRefusedError(`${branch} is checked out and not clean`);
    }
  }
  const trial = await trialMerge(root, state.tip, trunk);
  if (trial.conflicts.length > 0) {
    const listed = trial.conflicts.map((conflict) => `  ${conflict}`).join("\n");
    throw new SpecLandingRefusedError(
      `merging ${trunk} into ${branch} conflicts; ${branch} is unchanged. Conflicting paths:\n${listed}`,
    );
  }
  const commit = await requireGit(
    root,
    "commit-tree",
    trial.tree,
    "-p",
    state.tip,
    "-p",
    trunk,
    "-m",
    `chore: 🔀 sync ${trunk} into ${branch}`,
  );
  await requireGit(root, "update-ref", `refs/heads/${branch}`, commit, state.tip);
  if (holder !== undefined) await requireGit(root, "reset", "--hard", "-q", commit);
  return commit;
}

function reportRefusal(subcommand: string, error: unknown): number {
  if (error instanceof SpecLandingRefusedError) {
    console.error(`emet spec-branch ${subcommand}: ${error.message}`);
    return exitCodes.findings;
  }
  console.error(`emet spec-branch ${subcommand}: ${errorMessage(error)}`);
  return exitCodes.internal;
}

/** `emet spec-branch sync`: merges trunk into `spec/<id>`; a conflict stops with the branch untouched. */
export async function runSync(_argv: string[], context: SpecBranchContext): Promise<number> {
  try {
    const before = (await requireState(context)).tip;
    const tip = await mergeTrunkIntoSpecBranch(context);
    console.log(
      JSON.stringify({ branch: specBranchName(context.spec), tip, merged: tip !== before }),
    );
    return exitCodes.success;
  } catch (error: unknown) {
    return reportRefusal("sync", error);
  }
}

function closesLines(tickets: string[], trackerKind: string): string[] {
  if (trackerKind === "local") return [];
  if (trackerKind === "linear") return tickets.map((ticket) => `Closes ${ticket}`);
  return tickets.flatMap((ticket) => {
    const number = /(\d+)$/.exec(ticket)?.[1];
    return number === undefined ? [] : [`Closes #${number}`];
  });
}

function landingTitle(spec: string, partial: boolean): string {
  return `feat: ✨ land spec ${spec}${partial ? " (partial)" : ""}`;
}

function landingBody(
  spec: string,
  state: SpecBranchState,
  tickets: string[],
  trackerKind: string,
): string {
  const waves = state.waves.map((entry) => `- wave ${entry.wave}: ${entry.tickets.join(", ")}`);
  return [
    `Spec ${spec}, landed from ${state.branch}.`,
    "",
    ...waves,
    "",
    ...closesLines(tickets, trackerKind),
  ].join("\n");
}

async function runGh(root: string, ...args: string[]): Promise<string> {
  const result = await Bun.$`gh ${args}`.cwd(root).nothrow().quiet();
  if (result.exitCode !== 0) {
    const reason = result.stderr.toString().trim();
    throw new SpecLandingRefusedError(`gh ${args[0]} ${args[1]} failed: ${reason}`);
  }
  return result.stdout.toString().trim();
}

const CHECKS_TIMEOUT_MS = 30 * 60 * 1000;
const CHECKS_POLL_MS = 15 * 1000;
const NO_CHECKS_GRACE_POLLS = 8;

/**
 * Waits for a PR's checks to pass. A PR with no checks yet is polled for a
 * grace period, since right after `gh pr create` GitHub has often not
 * registered any; only then does "no checks" count as a pass. Any other
 * outcome than a pass leaves the PR open.
 */
export async function waitForSpecChecks(
  pullRequest: string,
  deps: WaitForChecksDeps,
  timing: { timeoutMs: number; pollMs: number } = {
    timeoutMs: CHECKS_TIMEOUT_MS,
    pollMs: CHECKS_POLL_MS,
  },
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each poll depends on the previous one
    const outcome = await waitForChecks({ pr: pullRequest, ...timing, rerunFlakes: true }, deps);
    if (outcome.state === "pass" && outcome.noChecks && attempt < NO_CHECKS_GRACE_POLLS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: waits between polls
      await deps.sleep(timing.pollMs);
      continue;
    }
    if (outcome.state === "pass") return;
    const failed = outcome.failedChecks.length > 0 ? `: ${outcome.failedChecks.join(", ")}` : "";
    throw new SpecLandingRefusedError(
      `checks on ${pullRequest} ended ${outcome.state}${failed}; the PR stays open and a rerun of land reuses it`,
    );
  }
}

async function landByPullRequest(
  context: SpecBranchContext,
  state: SpecBranchState,
  title: string,
  body: string,
): Promise<{ pullRequest: string }> {
  const { root, config } = context;
  const pushed = await git(root, "push", config.repo.remote, `${state.branch}:${state.branch}`);
  if (pushed.exitCode !== 0) {
    throw new SpecLandingRefusedError(`pushing ${state.branch} failed: ${pushed.stderr}`);
  }
  const existing = await runGh(
    root,
    "pr",
    "list",
    "--head",
    state.branch,
    "--state",
    "open",
    "--json",
    "url",
    "--jq",
    ".[0].url // empty",
  );
  const pullRequest =
    existing.length > 0
      ? existing
      : await runGh(
          root,
          "pr",
          "create",
          "--base",
          config.repo.trunk,
          "--head",
          state.branch,
          "--title",
          title,
          "--body",
          body,
        );
  await waitForSpecChecks(pullRequest, { gh: realGh, sleep: Bun.sleep, now: Date.now });
  await runGh(root, "pr", "merge", pullRequest, `--${config.landing.specMergeMethod}`);
  return { pullRequest };
}

async function requireLandableTrunk(root: string, trunk: string, branch: string): Promise<string> {
  const head = await git(root, "symbolic-ref", "--short", "-q", "HEAD");
  if (head.exitCode !== 0) {
    throw new SpecLandingRefusedError(`main worktree is on a detached HEAD, not ${trunk}`);
  }
  if (head.stdout !== trunk) {
    throw new SpecLandingRefusedError(`main worktree is on ${head.stdout}, not ${trunk}`);
  }
  const dirty = await requireGit(root, "status", "--porcelain", "--untracked-files=no");
  if (dirty.length > 0) throw new SpecLandingRefusedError("main worktree is not clean");
  const ancestor = await git(root, "merge-base", "--is-ancestor", branch, trunk);
  if (ancestor.exitCode === 0) {
    throw new SpecLandingRefusedError(`${branch} is already merged into ${trunk}`);
  }
  const trial = await git(root, "merge-tree", "--write-tree", trunk, branch);
  if (trial.exitCode !== 0) {
    throw new SpecLandingRefusedError(`merge conflict between ${branch} and ${trunk}`);
  }
  return requireGit(root, "rev-parse", trunk);
}

async function landLocally(
  context: SpecBranchContext,
  state: SpecBranchState,
  title: string,
  body: string,
): Promise<{ trunkTip: string }> {
  const { root } = context;
  const trunk = context.config.repo.trunk;
  const original = await requireLandableTrunk(root, trunk, state.branch);
  const merged = await git(root, "merge", "--no-ff", "-m", title, "-m", body, state.branch);
  if (merged.exitCode !== 0) {
    await git(root, "merge", "--abort");
    await git(root, "reset", "--merge", original);
    throw new SpecLandingRefusedError(
      `merging ${state.branch} into ${trunk} failed: ${merged.stderr}`,
    );
  }
  return { trunkTip: await requireGit(root, "rev-parse", trunk) };
}

async function mainWorktree(cwd: string): Promise<string> {
  const common = await requireGit(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return path.dirname(await realpath(common));
}

/** `emet spec-branch land`: syncs, then lands `spec/<id>` once. */
export async function runLand(argv: string[], context: SpecBranchContext): Promise<number> {
  try {
    const partial = argv.includes("--partial");
    await mergeTrunkIntoSpecBranch(context);
    const state = await requireState(context);
    if (state.waves.length === 0) {
      throw new SpecLandingRefusedError(`${state.branch} has no integrated wave to land`);
    }
    const tickets = state.waves.flatMap((entry) => entry.tickets);
    const title = landingTitle(context.spec, partial);
    const body = landingBody(context.spec, state, tickets, context.config.tracker.kind ?? "github");
    const mode = context.config.landing.mode;
    const landed =
      mode === "merge"
        ? await landLocally(
            { ...context, root: await mainWorktree(context.root) },
            state,
            title,
            body,
          )
        : await landByPullRequest(context, state, title, body);
    appendEvent({
      kind: "spec.land",
      repo: context.root,
      origin: "auto",
      data: {
        spec: context.spec,
        mode,
        partial,
        waves: state.waves.map((entry) => entry.wave),
        tickets,
        tip: state.tip,
        ...landed,
      },
    });
    console.log(
      JSON.stringify({ spec: context.spec, mode, partial, tickets, tip: state.tip, ...landed }),
    );
    return exitCodes.success;
  } catch (error: unknown) {
    return reportRefusal("land", error);
  }
}
