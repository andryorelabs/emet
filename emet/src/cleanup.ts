/**
 * Deletes the local branches a `/emet` wave leaves behind once its PR has
 * merged, and prunes stale worktree metadata. Every `worktree-agent-*` (the
 * scaffolding branch `Agent`'s `isolation: "worktree"` creates automatically)
 * and ticket-prefixed worker branch is classified by content before anything
 * is deleted: `git merge-base --is-ancestor` catches a plain merge or
 * fast-forward, and `git merge-tree --write-tree <remote>/<trunk> <branch>`
 * compared against `git rev-parse <remote>/<trunk>^{tree}` catches a squash
 * merge — this repo's actual merge style, and the one case `git cherry`
 * cannot see, since it matches patch-ids per commit and a squash collapses N
 * commits into one with a different patch-id. `remote`/`trunk` come from
 * `emet.config.json`'s `repo.remote`/`repo.trunk` (see `config.ts`) —
 * there's no default here, missing config is a hard `exit 2` (see `run()`),
 * since a wrong trunk here doesn't warn, it deletes unmerged work. Only a
 * branch resolved as fully contained in `<remote>/<trunk>` (either way) is
 * force-deleted; anything else is left alone and reported, along with the
 * exact `git branch -D` command to run by hand.
 *
 * The comparison is always against the local `<remote>/<trunk>`, so it fails
 * closed: a stale local ref (this script wasn't preceded by a fetch) makes an
 * already-merged branch look unmerged and it survives — never the other way
 * around. `git fetch --quiet <remote> <trunk>` runs first to keep that stale
 * window short; a failed fetch (offline) just falls back to whatever
 * `<remote>/<trunk>` already is.
 *
 * A branch checked out by a live worktree is never touched, detected two
 * ways: an `ao-*` branch via its own `%(worktreepath)`, and a
 * `worktree-agent-<id>` branch via the matching `.claude/worktrees/agent-<id>`
 * directory still existing — the worker's `git checkout -b ao-*` (see
 * docs/agents/emet.md) leaves the scaffolding branch itself with an empty
 * `%(worktreepath)`, so it needs this second signal to not look abandoned.
 * `git worktree prune` runs before either signal is read, since both read the
 * same metadata and stale entries would make the guard see live worktrees as
 * gone. `git worktree prune` itself deletes no branch and no directory — it
 * only unregisters `.git/worktrees/<id>` entries whose directory is already
 * gone — so it stays unconditional and always runs first, confirmed safe by
 * an adversarial review of AO-260.
 *
 * **Run scoping (AO-260) — concurrent `/emet` sessions never delete each
 * other's branches.** Every worktree a `/emet` worker bootstraps is
 * `git worktree lock`ed with a reason of the shape
 * `emet run=<runId> ticket=<ticket> anchor=<pid> at=<iso>`
 * ({@link resolveWorktreeOwner}, `worktrees.ts`). A locked worktree is
 * never a deletion candidate, full stop, regardless of what content
 * classification says about the branch it holds ({@link guardBranch}) — the
 * classifier is never even consulted for one. `--run <id>` scopes the whole
 * sweep to branches whose still-locked worktree resolves to that run id,
 * releasing the ticket's reservation (`claims.ts`) after each
 * successful deletion, and — once branch cleanup is done — every worker slot
 * (`slots.ts`) that run still holds, so a wave's `EMET_MAX_LIVE_WORKERS`
 * capacity is freed back up without the coordinator having to track which
 * indices it acquired. With no `--run` (the default) or the explicit,
 * synonymous `--all`, every branch in the repo is swept as before, but a
 * locked worktree whose owning run classifies (`classifyRun`,
 * `runs.ts`) as `'live'` or `'idle'` is skipped and reported
 * separately from a `'dead'` owner or a non-`/emet` lock reason, which both
 * fall into a generic "locked, protected" bucket — either way, never
 * deleted.
 *
 * Classification happens in a first pass with no mutations; deletion only
 * starts once every branch has a verdict, so a `git` error midway through
 * never leaves the repo in a half-cleaned state. Pass `--dry-run` to print
 * the plan without deleting anything.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { configureTicketPattern, listReservations, releaseTicket } from "./claims";
import { type AgentHost, claudeHost } from "./agenthost";
import { agentHostOfConfig } from "./dependencies";
import { ForgeConfigError, requireForgeConfig, resolveRepoRoot, type ForgeConfig } from "./config";
import { resolveLandedVerdict, type LandedContext, type LandedVerdict } from "./landed";
import { optionalProperty } from "./optional";
import {
  classifyRun,
  isRunClosed,
  markRunClosed,
  resolveIdleThresholdMs,
  resolveSessionSlug,
  type RunVerdict,
} from "./runs";
import { BINARY, CONFIG_FILE } from "./names";
import { writePhase } from "./phase";
import { releaseAllSlotsForRun } from "./slots";
import {
  type BranchEntry,
  type BranchVerdict,
  classifyByContent,
  isForeignWorktree,
  isForgeShapedBranch,
  isSafeToDelete,
  isWorktreeAgentBranchLive,
  listBranches,
  listLiveWorktreeDirectoryNames,
  listWorktreeEntries,
  resolveMainTree,
  trunkReference,
  resolveWorktreeOwner,
  resolveWorktreeOwnerWithReservations,
  type WorktreeEntry,
  type WorktreeOwner,
} from "./worktrees";

type CleanupCategory =
  | "in-use"
  | "to-delete"
  | "needs-review"
  | "locked-protected"
  | "live-or-idle-protected"
  | "out-of-scope";

type ClassifiedBranch = {
  readonly name: string;
  readonly category: CleanupCategory;
  readonly contentVerdict?: BranchVerdict;
  readonly ownerRunId?: string;
  readonly ownerTicket?: string;
  readonly runVerdict?: RunVerdict;
};

type CleanupMode = "run" | "finished" | "all";

export type CleanupOptions = {
  readonly dryRun: boolean;
  readonly mode: CleanupMode;
  readonly runId: string | null;
  readonly force: boolean;
};

/** A malformed `emet cleanup` command line: reported as a plain message with exit code 2. */
export class CleanupUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanupUsageError";
  }
}

/**
 * Three modes. `--run <id>` reclaims the worktrees and branches of that one
 * run (`"run"`). The bare command reclaims every owned worktree whose run is
 * closed or dead and whose ticket landed (`"finished"`), and never touches a
 * live or idle run or a foreign worktree. `--all` is the deliberate repo-wide
 * branch sweep it always was (`"all"`). `--run` and `--all` are mutually
 * exclusive. `--dry-run` only prints the plan.
 *
 * `--force` lifts protection in `--all` mode on exactly one case: a locked
 * worktree whose owning run {@link classifyRun} resolves to `'dead'` (see
 * {@link guardBranch}). It does nothing for a live or idle owner or a lock
 * this parser can't attribute to any run, and has no effect in the other two
 * modes.
 */
export function parseCleanupArguments(argv: readonly string[]): CleanupOptions {
  const isDryRun = argv.includes("--dry-run");
  const isAll = argv.includes("--all");
  const isForce = argv.includes("--force");

  const runIndex = argv.indexOf("--run");
  let runId: string | null = null;
  if (runIndex !== -1) {
    const value = argv[runIndex + 1];
    if (!value || value.startsWith("--")) {
      throw new CleanupUsageError(
        `${BINARY}:cleanup — --run requires a value, e.g. --run session_abc123`,
      );
    }
    runId = value;
  }

  if (runId !== null && isAll) {
    throw new CleanupUsageError(`${BINARY}:cleanup — --run and --all are mutually exclusive`);
  }

  const mode: CleanupMode = runId !== null ? "run" : isAll ? "all" : "finished";
  return { dryRun: isDryRun, mode, runId, force: isForce };
}

/**
 * Correlates a branch name back to the `git worktree list` entry that
 * checked it out, if one is still registered — a second, independent signal
 * {@link guardBranch} layers on top of the older `%(worktreepath)`/live-
 * directory check, since the two are read via separate `git` invocations and
 * can (rarely) disagree for a beat mid-checkout. An `ao-*` branch matches
 * directly on `entry.branch`; a `worktree-agent-<id>` scaffold branch never
 * appears as `entry.branch` once its worker checks out its own `ao-*` branch
 * (see the file-level doc comment above), so it matches instead on the
 * `.claude/worktrees/agent-<id>` directory basename — the same correlation
 * {@link isWorktreeAgentBranchLive} already uses for liveness.
 */
export function findWorktreeEntryForBranch(
  branchName: string,
  entries: readonly WorktreeEntry[],
): WorktreeEntry | undefined {
  const direct = entries.find((entry) => entry.branch === branchName);
  if (direct) return direct;
  if (!branchName.startsWith("worktree-")) return undefined;
  const agentId = branchName.slice("worktree-".length);
  return entries.find((entry) => path.basename(entry.directory) === agentId);
}

export type GuardOutcome =
  | {
      readonly done: true;
      readonly category: Exclude<CleanupCategory, "to-delete" | "needs-review">;
      readonly ownerRunId?: string;
      readonly runVerdict?: RunVerdict;
    }
  | { readonly done: false; readonly owner: WorktreeOwner | null };

/**
 * Decides, for one branch, whether classification should even reach
 * `classifyByContent` — or whether a cheaper signal already resolves it: a
 * live worktree checkout (`isBaselineLive`, the pre-existing
 * `%(worktreepath)`/live-directory check), a `git worktree lock` its
 * worktree still holds (`matchedEntry`, from
 * {@link findWorktreeEntryForBranch}), or, in `--run` mode, simply not
 * belonging to the run being cleaned up.
 *
 * A locked worktree is **never** a deletion candidate, regardless of what
 * content classification would say (AO-260 point 3) — this function never
 * reaches `classifyByContent` for one. In `--run` mode a branch only
 * proceeds when its worktree's lock resolves to that exact run id;
 * everything else — unlocked, locked by someone else, or unowned — is
 * `'out-of-scope'` and left untouched. Outside `--run` mode, a locked
 * worktree whose owning run classifies as `'live'` or `'idle'` gets its own
 * `'live-or-idle-protected'` category so the report can tell it apart from a
 * `'dead'` owner or an unparseable (non-`/emet`) lock reason, both of which
 * fall back to the generic `'locked-protected'` bucket — either way, the
 * lock alone is reason enough to never touch it, *unless* `force` is set and
 * the owner specifically classifies `'dead'` (see `parseCleanupArguments`'s
 * `--force` doc above) — that one case proceeds to classification instead of
 * being protected. `force` never lifts protection for `'live'`/`'idle'`
 * owners or for a lock this parser can't attribute to any run at all.
 */
export function guardBranch(
  isBaselineLive: boolean,
  matchedEntry: WorktreeEntry | undefined,
  runId: string | null,
  classifyRunFunction: typeof classifyRun = classifyRun,
  force = false,
): GuardOutcome {
  if (isBaselineLive) return { done: true, category: "in-use" };

  if (!matchedEntry || matchedEntry.lockedReason === null) {
    return runId === null ? { done: false, owner: null } : { done: true, category: "out-of-scope" };
  }

  const owner = resolveWorktreeOwner(matchedEntry);

  if (runId !== null) {
    return owner && owner.runId === runId
      ? { done: false, owner }
      : { done: true, category: "out-of-scope" };
  }

  if (!owner) return { done: true, category: "locked-protected" };

  /**
   * The coordinator's transcript lives under *its own* project slug, not
   * this worktree's directory — see `WorktreeOwner`'s doc comment
   * (worktrees.ts). Fall back to the directory-derived guess only for a lock
   * reason written before `slug=` existed.
   */
  const verdict = classifyRunFunction(
    owner.anchorPid,
    owner.coordinatorSlug ?? resolveSessionSlug(matchedEntry.directory),
    owner.runId,
  );
  if (verdict === "dead") {
    return force ? { done: false, owner } : { done: true, category: "locked-protected" };
  }
  return {
    done: true,
    category: "live-or-idle-protected",
    ownerRunId: owner.runId,
    runVerdict: verdict,
  };
}

async function classifyOneBranch(
  name: string,
  isBaselineLive: boolean,
  matchedEntry: WorktreeEntry | undefined,
  runId: string | null,
  mainTree: string,
  remote: string,
  trunk: string,
  local: boolean,
  force: boolean,
  idleThresholdMs: number,
): Promise<ClassifiedBranch> {
  const guard = guardBranch(
    isBaselineLive,
    matchedEntry,
    runId,
    (anchorPid, sessionSlug, ownerRunId) =>
      classifyRun(anchorPid, sessionSlug, ownerRunId, { idleThresholdMs }),
    force,
  );
  if (guard.done) {
    return {
      name,
      category: guard.category,
      ...optionalProperty("ownerRunId", guard.ownerRunId),
      ...optionalProperty("runVerdict", guard.runVerdict),
    };
  }
  const contentVerdict = await classifyByContent(name, mainTree, remote, trunk, { local });
  return {
    name,
    category: isSafeToDelete(contentVerdict) ? "to-delete" : "needs-review",
    contentVerdict,
    ...optionalProperty("ownerTicket", guard.owner?.ticket),
    ...optionalProperty("ownerRunId", guard.owner?.runId),
  };
}

async function deleteBranch(branch: string): Promise<{ ok: boolean; message: string }> {
  const result = await Bun.$`git branch -D ${branch}`.nothrow().quiet();
  if (result.exitCode === 0) {
    return { ok: true, message: branch };
  }
  return {
    ok: false,
    message: `${branch} — ${result.stderr.toString().trim()}`,
  };
}

/**
 * Wraps {@link deleteBranch} with reservation cleanup (AO-260 point 1): once
 * a branch is actually gone, its ticket's claim in the registry
 * (T1b, `claims.ts`) is stale and must go with it, or a finished ticket
 * would look permanently reserved to the next `/emet` coordinator. Never
 * releases on a failed deletion — the branch, and whatever legitimately
 * still holds the reservation, is unchanged.
 *
 * `ticket`/`ownerRunId` are only ever set together, for a branch that
 * {@link guardBranch} resolved to a specific run's owned worktree — either
 * `--run <id>`'s exact match, or a `--force`-reclaimed `'dead'` owner in the
 * default/`--all` sweep. `ownerRunId` is passed straight through as
 * {@link releaseTicket}'s `expectedRunId`, so this never releases a
 * reservation `guardBranch` didn't already attribute to that same run.
 */
export async function deleteAndReleaseTicket(
  branchName: string,
  ticket: string | undefined,
  ownerRunId: string | undefined,
  deleteFunction: typeof deleteBranch,
  releaseFunction: typeof releaseTicket,
): Promise<{ ok: boolean; message: string }> {
  const result = await deleteFunction(branchName);
  if (ticket && ownerRunId && result.ok) {
    await releaseFunction(ticket, ownerRunId);
  }
  return result;
}

export type RemovalPlan = "remove" | "keep-dirty" | "keep-not-landed" | "protected";

/**
 * What to do with one worktree. `protected` wins over everything: no owner
 * (a foreign worktree, or a worktree whose lock is not emet's, even when a
 * claim matches its branch). Otherwise the ticket must have landed, and the
 * tree must be clean, before the worktree may be removed.
 */
export function planWorktreeRemoval(
  entry: WorktreeEntry,
  owner: WorktreeOwner | null,
  landed: LandedVerdict,
  isDirty: boolean,
): RemovalPlan {
  if (owner === null) return "protected";
  if (entry.lockedReason !== null && resolveWorktreeOwner(entry) === null) return "protected";
  if (landed !== "landed") return "keep-not-landed";
  if (isDirty) return "keep-dirty";
  return "remove";
}

type RunState = RunVerdict | "closed";

type ReclaimUnit = {
  readonly entry: WorktreeEntry;
  readonly owner: WorktreeOwner;
  readonly branches: readonly string[];
  readonly directoryExists: boolean;
};

type ReclaimContext = {
  readonly config: ForgeConfig;
  readonly mode: Exclude<CleanupMode, "all">;
  readonly runId: string | null;
  readonly dryRun: boolean;
  readonly trunkRef: string;
  readonly mainSha: string;
  readonly idleThresholdMs: number;
  readonly worktreeEntries: readonly WorktreeEntry[];
  readonly agentBranches: readonly BranchEntry[];
  readonly workerBranches: readonly BranchEntry[];
  readonly liveDirectoryNames?: ReadonlySet<string>;
  readonly resolveState?: (owner: WorktreeOwner, entry: WorktreeEntry) => Promise<RunState>;
  readonly readTrackerState?: LandedContext["readTrackerState"];
};

/**
 * Whether a reclaim may stamp the run closed: only a real `--run` sweep that
 * ended with no failures. Any failed removal or branch deletion leaves the
 * run open so the next sweep retries it.
 */
export function shouldMarkRunClosed(
  mode: Exclude<CleanupMode, "all">,
  runId: string | null,
  dryRun: boolean,
  failureCount: number,
): boolean {
  return !dryRun && mode === "run" && runId !== null && failureCount === 0;
}

/**
 * `worktree-agent-*` scaffold branches nothing refers to anymore: not checked
 * out in any worktree, and no `.claude/worktrees/<id>` directory registered
 * for them. Their worktree is already gone, so no live work sits on them,
 * but a branch may still hold commits nobody merged. These are only
 * candidates: {@link planOrphanedScaffolds} decides which may be deleted.
 */
export function findOrphanedScaffoldBranches(
  agentBranches: readonly BranchEntry[],
  worktreeEntries: readonly WorktreeEntry[],
  liveDirectoryNames: ReadonlySet<string>,
  host: AgentHost = claudeHost,
): string[] {
  const checkedOut = new Set<string>();
  for (const entry of worktreeEntries) {
    if (entry.branch !== null) checkedOut.add(entry.branch);
  }
  return agentBranches
    .filter(
      (branch) =>
        branch.worktreePath.length === 0 &&
        !checkedOut.has(branch.name) &&
        !isWorktreeAgentBranchLive(branch.name, liveDirectoryNames, host),
    )
    .map((branch) => branch.name);
}

export type OrphanedScaffoldPlan = {
  readonly deletable: readonly string[];
  readonly kept: readonly { readonly name: string; readonly verdict: BranchVerdict }[];
};

/**
 * Splits orphaned scaffold branches by content, with no mutations. A branch
 * may be deleted only when `classify` clears it ({@link isSafeToDelete}):
 * its tip is already contained in trunk, or its content is (a squash merge).
 * Anything else may hold unmerged commits, whoever made them, and is kept
 * for review.
 */
export async function planOrphanedScaffolds(
  branches: readonly string[],
  classify: (branch: string) => Promise<BranchVerdict>,
): Promise<OrphanedScaffoldPlan> {
  const deletable: string[] = [];
  const kept: { name: string; verdict: BranchVerdict }[] = [];
  for (const name of branches) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const verdict = await classify(name);
    if (isSafeToDelete(verdict)) deletable.push(name);
    else kept.push({ name, verdict });
  }
  return { deletable, kept };
}

async function classifyScaffoldsAgainstTrunk(
  config: ForgeConfig,
  branches: readonly string[],
): Promise<OrphanedScaffoldPlan> {
  if (branches.length === 0) return { deletable: [], kept: [] };
  const { remote, trunk } = config.repo;
  const local = config.landing.mode === "merge";
  const mainTree = await resolveMainTree(remote, trunk, { local });
  return planOrphanedScaffolds(branches, (branch) =>
    classifyByContent(branch, mainTree, remote, trunk, { local }),
  );
}

async function resolveRunState(
  owner: WorktreeOwner,
  entry: WorktreeEntry,
  idleThresholdMs: number,
): Promise<RunState> {
  if (await isRunClosed(owner.runId)) return "closed";
  return classifyRun(
    owner.anchorPid,
    owner.coordinatorSlug ?? resolveSessionSlug(entry.directory),
    owner.runId,
    { idleThresholdMs },
  );
}

async function isWorktreeDirty(directory: string): Promise<boolean> {
  if (!existsSync(directory)) return false;
  const result = await Bun.$`git -C ${directory} status --porcelain`.nothrow().quiet();
  return result.exitCode !== 0 || result.stdout.toString().trim().length > 0;
}

function branchesOfEntry(entry: WorktreeEntry, agentBranchNames: ReadonlySet<string>): string[] {
  const branches: string[] = [];
  const agentBranch = `worktree-${path.basename(entry.directory)}`;
  if (entry.branch !== null) branches.push(entry.branch);
  if (agentBranchNames.has(agentBranch) && agentBranch !== entry.branch) {
    branches.push(agentBranch);
  }
  return branches;
}

/**
 * First pass of `run`/`finished` mode: attributes every non-main worktree,
 * and every worker branch whose worktree directory is gone, to a run through
 * the lock then the claim, and keeps the ones this invocation may reclaim.
 * Everything else lands in `protectedLines` (active or unattributable) or is
 * silently out of scope. No mutations.
 */
export async function collectUnits(
  context: ReclaimContext,
): Promise<{ units: ReclaimUnit[]; protectedLines: string[]; outOfScope: number }> {
  const { config, mode, runId, idleThresholdMs, worktreeEntries } = context;
  const branchPrefix = config.ticket.branchPrefix;
  const reservations = await listReservations();
  const agentBranchNames = new Set(context.agentBranches.map((branch) => branch.name));
  const units: ReclaimUnit[] = [];
  const protectedLines: string[] = [];
  let outOfScope = 0;

  const consider = async (entry: WorktreeEntry, directoryExists: boolean): Promise<void> => {
    const owner = resolveWorktreeOwnerWithReservations(entry, reservations, branchPrefix);
    if (owner === null) {
      if (!isForeignWorktree(entry, owner, branchPrefix)) {
        protectedLines.push(`${entry.branch ?? entry.directory} — no owner, protected`);
      }
      return;
    }
    if (mode === "run" && owner.runId !== runId) {
      outOfScope += 1;
      return;
    }
    const branches = branchesOfEntry(entry, agentBranchNames).filter((branch) =>
      isForgeShapedBranch(branch, branchPrefix),
    );
    if (branches.length === 0) return;
    if (mode === "finished") {
      const state = context.resolveState
        ? await context.resolveState(owner, entry)
        : await resolveRunState(owner, entry, idleThresholdMs);
      if (state !== "closed" && state !== "dead") {
        protectedLines.push(`${branches[0]} (run ${owner.runId}, ${state}) — run is active`);
        return;
      }
    }
    units.push({ entry, owner, branches, directoryExists });
  };

  const [, ...otherEntries] = worktreeEntries;
  const checkedOutBranches = new Set<string>();
  for (const entry of worktreeEntries) {
    if (entry.branch !== null) checkedOutBranches.add(entry.branch);
  }
  for (const entry of otherEntries) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    await consider(entry, existsSync(entry.directory));
  }
  for (const branch of context.workerBranches) {
    if (checkedOutBranches.has(branch.name) || branch.worktreePath.length > 0) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    await consider({ directory: "", branch: branch.name, lockedReason: null }, false);
  }
  return { units, protectedLines, outOfScope };
}

async function removeWorktreeDirectory(unit: ReclaimUnit): Promise<string | null> {
  const { entry } = unit;
  if (!unit.directoryExists) return null;
  const lockedReason = entry.lockedReason;
  if (lockedReason !== null) await Bun.$`git worktree unlock ${entry.directory}`.nothrow().quiet();
  const result = await Bun.$`git worktree remove ${entry.directory}`.nothrow().quiet();
  if (result.exitCode === 0) return null;
  if (lockedReason !== null) {
    await Bun.$`git worktree lock ${entry.directory} --reason ${lockedReason}`.nothrow().quiet();
  }
  return `${entry.directory} — ${result.stderr.toString().trim()}`;
}

/**
 * Removes the worktree, deletes its branches and only then releases the
 * claim, so a failure midway never leaves a released claim for a branch that
 * still exists. Returns the failure messages (empty on success).
 */
async function reclaimUnit(unit: ReclaimUnit): Promise<string[]> {
  const removalFailure = await removeWorktreeDirectory(unit);
  if (removalFailure !== null) return [removalFailure];
  const failures: string[] = [];
  for (const branch of unit.branches) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const result = await deleteBranch(branch);
    if (!result.ok) failures.push(result.message);
  }
  if (failures.length === 0) {
    await releaseTicket(unit.owner.ticket, unit.owner.runId);
  }
  return failures;
}

export async function reclaimOwnedWorktrees(context: ReclaimContext): Promise<void> {
  const { config, mode, runId, dryRun, trunkRef, mainSha } = context;
  const scopeLabel = mode === "run" ? ` — run ${runId}` : " — closed or dead runs";
  console.log(
    `${BINARY}:cleanup — ${trunkRef} ${mainSha}${dryRun ? " (dry run)" : ""}${scopeLabel}\n`,
  );

  const { units, protectedLines, outOfScope } = await collectUnits(context);

  const planned: { unit: ReclaimUnit; landed: LandedVerdict; plan: RemovalPlan }[] = [];
  for (const unit of units) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const landed = await resolveLandedVerdict(
      { ticket: unit.owner.ticket, branch: unit.branches[0]! },
      { config, ...optionalProperty("readTrackerState", context.readTrackerState) },
    );
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const isDirty = await isWorktreeDirty(unit.entry.directory);
    const plan = planWorktreeRemoval(unit.entry, unit.owner, landed, isDirty);
    planned.push({ unit, landed, plan });
  }

  const claimedBranches = new Set(units.flatMap((unit) => unit.branches));
  const orphanedScaffolds = findOrphanedScaffoldBranches(
    context.agentBranches,
    context.worktreeEntries,
    context.liveDirectoryNames ?? new Set<string>(),
    agentHostOfConfig(config),
  ).filter((branch) => !claimedBranches.has(branch));
  const scaffoldPlan = await classifyScaffoldsAgainstTrunk(config, orphanedScaffolds);

  const reclaimedRuns = new Set<string>();
  const failures: string[] = [];
  const removed: string[] = [];
  const removedScaffolds: string[] = [];
  for (const { unit, plan } of planned) {
    if (plan !== "remove") continue;
    const where = unit.directoryExists ? unit.entry.directory : unit.branches[0];
    const label = `${where} (${unit.branches.join(", ")})`;
    if (dryRun) {
      removed.push(label);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const unitFailures = await reclaimUnit(unit);
    if (unitFailures.length === 0) {
      removed.push(label);
      reclaimedRuns.add(unit.owner.runId);
    } else {
      failures.push(...unitFailures);
    }
  }

  for (const branch of scaffoldPlan.deletable) {
    if (dryRun) {
      removedScaffolds.push(branch);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const result = await deleteBranch(branch);
    if (result.ok) removedScaffolds.push(branch);
    else failures.push(result.message);
  }

  console.log(`${dryRun ? "Would reclaim" : "Reclaimed"} ${removed.length} worktree(s):`);
  for (const label of removed) console.log(`  - ${label}`);
  if (removedScaffolds.length > 0) {
    console.log(
      `\n${dryRun ? "Would delete" : "Deleted"} ${removedScaffolds.length} orphaned scaffold branch(es):`,
    );
    for (const branch of removedScaffolds) console.log(`  - ${branch}`);
  }
  if (scaffoldPlan.kept.length > 0) {
    console.log(
      `\nKept ${scaffoldPlan.kept.length} orphaned scaffold branch(es) with unmerged or unresolved work — review, then delete by hand:`,
    );
    for (const { name, verdict } of scaffoldPlan.kept) {
      console.log(`  - ${name} (${verdict}) — git branch -D ${name}`);
    }
  }

  const keptDirty = planned.filter((item) => item.plan === "keep-dirty");
  if (keptDirty.length > 0) {
    console.log(`\nKept ${keptDirty.length} dirty worktree(s) — commit or discard, then run:`);
    for (const { unit } of keptDirty) {
      console.log(`  - ${unit.entry.directory} — git worktree remove "${unit.entry.directory}"`);
    }
  }
  const keptNotLanded = planned.filter((item) => item.plan === "keep-not-landed");
  if (keptNotLanded.length > 0) {
    console.log(`\nKept ${keptNotLanded.length} worktree(s) whose ticket has not landed:`);
    for (const { unit, landed } of keptNotLanded) {
      console.log(`  - ${unit.branches[0]} (${landed})`);
    }
  }
  if (protectedLines.length > 0) {
    console.log(`\nSkipped ${protectedLines.length} worktree(s), protected:`);
    for (const line of protectedLines) console.log(`  - ${line}`);
  }
  if (outOfScope > 0) {
    console.log(`\n${outOfScope} worktree(s) out of scope for run ${runId} — not touched.`);
  }
  if (failures.length > 0) {
    console.log(`\nFailed to reclaim ${failures.length} item(s):`);
    for (const message of failures) console.log(`  - ${message}`);
    process.exitCode = 1;
  }

  if (!dryRun) {
    const slotRuns = mode === "run" && runId !== null ? [runId] : [...reclaimedRuns];
    for (const slotRunId of slotRuns) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const releasedSlots = await releaseAllSlotsForRun(slotRunId);
      if (releasedSlots.length > 0) {
        console.log(
          `\nReleased ${releasedSlots.length} worker slot(s) for run ${slotRunId}: ${releasedSlots.join(", ")}.`,
        );
      }
    }
    if (runId !== null && shouldMarkRunClosed(mode, runId, dryRun, failures.length)) {
      await markRunClosed(runId);
      console.log(`\nRun ${runId} marked closed.`);
    }
  }
  if (dryRun) console.log("\nDry run — nothing was deleted.");
}

async function main(config: ForgeConfig) {
  const host = agentHostOfConfig(config);
  const { dryRun, mode, runId, force } = parseCleanupArguments(process.argv.slice(2));
  const { remote, trunk } = config.repo;
  const local = config.landing.mode === "merge";
  const branchPrefix = config.ticket.branchPrefix;
  const idleThresholdMs = resolveIdleThresholdMs(config);

  const trunkRef = trunkReference(remote, trunk, local);
  console.log(
    `Using ${trunkRef} (from ${CONFIG_FILE}'s repo.remote/repo.trunk) as the merge-base reference.`,
  );

  /**
   * Skipped under --dry-run: a dry run must only report, never mutate git's
   * own admin state. `git worktree prune` deletes no branch and no
   * directory (see the file-level comment above), but it does rewrite
   * `.git/worktrees/*` — a real mutation a "would delete" preview has no
   * business making. `git fetch` still runs either way: the merge-base
   * reference the dry-run report itself relies on needs it.
   */
  if (!dryRun) {
    await Bun.$`git worktree prune`.nothrow().quiet();
  }
  if (!local) {
    await Bun.$`git fetch --quiet ${remote} ${trunk}`.nothrow().quiet();
  }

  const mainShaResult = await Bun.$`git rev-parse ${trunkRef}`.nothrow().quiet();
  if (mainShaResult.exitCode !== 0) {
    throw new ForgeConfigError(
      `${BINARY} cleanup: could not resolve ${trunkRef} — check ${CONFIG_FILE}'s repo.remote/repo.trunk and that you've fetched.`,
    );
  }
  const mainSha = mainShaResult.stdout.toString().trim();
  const mainTree = await resolveMainTree(remote, trunk, { local });
  /**
   * Branches are listed before the worktrees on purpose: a scaffold branch
   * seen here already had its worktree added, so the worktree listing read
   * next always includes it. The other order could miss a worktree added
   * between the two reads and make its scaffold look orphaned.
   */
  const worktreeAgentBranches = await listBranches(
    `worktree-${host.worktreeLayout.agentDirPrefix}*`,
  );
  const aoBranches = await listBranches(`${branchPrefix}-*`);
  const liveWorktreeDirectoryNames = await listLiveWorktreeDirectoryNames();
  const worktreeEntries = await listWorktreeEntries();

  if (mode !== "all") {
    await reclaimOwnedWorktrees({
      config,
      mode,
      runId,
      dryRun,
      trunkRef,
      mainSha,
      idleThresholdMs,
      worktreeEntries,
      agentBranches: worktreeAgentBranches,
      workerBranches: aoBranches,
      liveDirectoryNames: liveWorktreeDirectoryNames,
    });
    return;
  }

  const classified: ClassifiedBranch[] = [];
  for (const entry of worktreeAgentBranches) {
    const isBaselineLive = isWorktreeAgentBranchLive(entry.name, liveWorktreeDirectoryNames, host);
    const matchedEntry = findWorktreeEntryForBranch(entry.name, worktreeEntries);
    classified.push(
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      await classifyOneBranch(
        entry.name,
        isBaselineLive,
        matchedEntry,
        runId,
        mainTree,
        remote,
        trunk,
        local,
        force,
        idleThresholdMs,
      ),
    );
  }
  for (const entry of aoBranches) {
    const isBaselineLive = entry.worktreePath.length > 0;
    const matchedEntry = findWorktreeEntryForBranch(entry.name, worktreeEntries);
    classified.push(
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      await classifyOneBranch(
        entry.name,
        isBaselineLive,
        matchedEntry,
        runId,
        mainTree,
        remote,
        trunk,
        local,
        force,
        idleThresholdMs,
      ),
    );
  }

  const scopeLabel = " — explicit repo-wide sweep";
  console.log(
    `${BINARY}:cleanup — ${trunkRef} ${mainSha}${dryRun ? " (dry run)" : ""}${scopeLabel}\n`,
  );

  const toDelete = classified.filter((branch) => branch.category === "to-delete");
  const inUse = classified.filter((branch) => branch.category === "in-use");
  const needsReview = classified.filter((branch) => branch.category === "needs-review");
  const liveOrIdleProtected = classified.filter(
    (branch) => branch.category === "live-or-idle-protected",
  );
  const lockedProtected = classified.filter((branch) => branch.category === "locked-protected");
  const outOfScope = classified.filter((branch) => branch.category === "out-of-scope");

  if (dryRun) {
    for (const branch of toDelete) {
      console.log(`Would delete: ${branch.name} (${branch.contentVerdict})`);
    }
  } else {
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const branch of toDelete) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const result = await deleteAndReleaseTicket(
        branch.name,
        branch.ownerTicket,
        branch.ownerRunId,
        deleteBranch,
        releaseTicket,
      );
      if (result.ok) {
        deleted.push(`${result.message} (${branch.contentVerdict})`);
      } else {
        failed.push(result.message);
      }
    }
    console.log(`Deleted ${deleted.length} branch(es):`);
    for (const message of deleted) {
      console.log(`  - ${message}`);
    }
    if (failed.length > 0) {
      console.log(`\nFailed to delete ${failed.length} branch(es):`);
      for (const message of failed) {
        console.log(`  - ${message}`);
      }
      process.exitCode = 1;
    }
  }

  if (inUse.length > 0) {
    console.log(`\nKept ${inUse.length} branch(es) held by a live worktree:`);
    for (const branch of inUse) {
      console.log(`  - ${branch.name}`);
    }
  }

  if (needsReview.length > 0) {
    console.log(
      `\nKept ${needsReview.length} branch(es) with unmerged or unresolved work — review, then delete by hand:`,
    );
    for (const branch of needsReview) {
      console.log(`  - ${branch.name} (${branch.contentVerdict}) — git branch -D ${branch.name}`);
    }
  }

  if (liveOrIdleProtected.length > 0) {
    console.log(
      `\nSkipped ${liveOrIdleProtected.length} branch(es) — owning run is still active, protected:`,
    );
    for (const branch of liveOrIdleProtected) {
      console.log(`  - ${branch.name} (run ${branch.ownerRunId}, ${branch.runVerdict})`);
    }
  }

  if (lockedProtected.length > 0) {
    console.log(`\nSkipped ${lockedProtected.length} branch(es) — worktree is locked, protected:`);
    for (const branch of lockedProtected) {
      console.log(`  - ${branch.name}`);
    }
  }

  if (outOfScope.length > 0) {
    console.log(`\n${outOfScope.length} branch(es) out of scope — not touched.`);
  }

  console.log(dryRun ? "\nDry run — nothing was deleted." : "\ngit worktree prune complete.");
}

/**
 * Entry point invoked by the `emet` CLI dispatcher (`bin/emet.ts`) for the
 * `cleanup` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 * `cleanup` deletes branches, so — like `preflight` — a missing or malformed
 * `emet.config.json` is always fatal (exit 2), never a silent fall back to
 * defaults: this script used to run with zero config validation at all,
 * which is exactly how a wrong trunk destroys unmerged work instead of
 * merely producing a wrong report.
 *
 * The `import.meta.main` guard below this function is still what matters for
 * test safety — false when `cleanup.test.ts` imports this module's exported
 * pure functions, so importing it for testing never runs a real, repo-wide
 * `git branch -D` sweep as a side effect.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError(`${BINARY} cleanup: not inside a git repository`);
    }
    const config = await requireForgeConfig(repoRoot);
    /**
     * `deleteAndReleaseTicket` below calls `claims.ts`'s `releaseTicket`,
     * which validates against `claims.ts`'s module-level `TICKET_PATTERN`
     * (default: the generic `AO-<digits>`-shaped pattern). Without this call,
     * a repo with a differently-shaped `ticket.idPattern` (e.g. a numeric
     * `^#?\d+$` github/local id) throws mid-sweep — after some branches are
     * already deleted, before `releaseAllSlotsForRun` ever runs — leaking
     * that run's worker slots. `claims.ts`'s own `run()` configures this for
     * itself; `cleanup.ts` must do the same since it calls into that module
     * directly rather than through the `emet claims` CLI entry point.
     */
    configureTicketPattern(config.ticket.idPattern);
    await main(config);
    const { dryRun, mode, runId } = parseCleanupArguments(argv);
    if (!dryRun && mode === "run" && !process.exitCode) {
      writePhase(repoRoot, { phase: "done", wave: null, spec: null, runId });
    }
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError || error instanceof CleanupUsageError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
