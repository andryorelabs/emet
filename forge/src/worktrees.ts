import path from "node:path";

import type { Reservation } from "./claims";

/**
 * Shared worktree/branch classification used by both `cleanup.ts` and
 * `preflight.ts` — extracted so the two scripts never disagree about
 * what counts as "live" vs. "safe to delete". See `cleanup.ts`'s own
 * top-of-file comment for the full rationale (squash-merge detection via
 * `git merge-tree`, why `git cherry` can't be used, the two-signal liveness
 * check).
 */

/**
 * Whether `directory` (an absolute path, as `git worktree list --porcelain`
 * always reports) is one of `/forge`'s own agent worktrees — i.e. lives
 * under some checkout's `.claude/worktrees/`, as opposed to the main
 * checkout itself or an ordinary feature-branch worktree a human made by
 * hand.
 *
 * **This used to be `isOwnAgentWorktree(directory, repoRoot)`, matching only
 * `<repoRoot>/.claude/worktrees/`** — `repoRoot` being the caller's own `git
 * rev-parse --show-toplevel`, on the assumption that Claude Code's `Agent`
 * `isolation: "worktree"` always nests a new agent worktree inside the
 * *launching* worktree's own `.claude/worktrees/`. **That assumption is
 * false**: measured across three separate `/forge` runs, each launched from
 * an Orca-managed secondary worktree
 * (`~/orca/workspaces/<repo>/{urchin,tern,hake}`), every dispatched agent
 * worktree landed under the repo's **main checkout's**
 * `.claude/worktrees/` instead — regardless of which worktree the
 * coordinator itself was running from (see `reference/incidents.md`, "The
 * post-dispatch audit that checked zero worktrees"). Under that prefix
 * filter, a coordinator running from anywhere but the main checkout matched
 * none of its own real agent worktrees, so `preflight --post-dispatch`
 * printed `0 worktree(s) checked ... OK` and every one of its four
 * enforcement gates (duplicate ticket worktree, duplicate branch number,
 * unlocked-past-deadline, branch/ticket mismatch) silently never ran.
 *
 * The fix is to stop trying to scope "own" by *path* at all — this function
 * now matches any agent worktree, anywhere, from any coordinator on this
 * repo. Whose it is (this run's, a sibling run's, or unattributed) is
 * decided downstream from the worktree's own `git worktree lock` reason via
 * {@link resolveWorktreeOwner}'s `runId`, which is the one signal that
 * actually identifies a run — see `preflight.ts`'s `mainPostDispatch`.
 */
export function isAgentWorktree(directory: string): boolean {
  return directory.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);
}

/**
 * What {@link classifyByContent} itself can actually return. Kept distinct
 * from {@link BranchVerdict} so the compiler can catch a future attempt to
 * add a case the function doesn't produce — `'in-use'` is never a content
 * verdict, it's a caller-side fact (a branch is checked out by a live
 * worktree) composed on top, see `cleanup.ts`'s `ClassifiedBranch`.
 */
export type ContentVerdict = "merged" | "equivalent" | "diverged" | "conflicted";

/**
 * The wider verdict type callers compose once they layer their own
 * `'in-use'` signal on top of {@link ContentVerdict} — accepted by
 * {@link isSafeToDelete} so both a bare content verdict and a
 * caller-composed one can be checked with the same function.
 */
export type BranchVerdict = ContentVerdict | "in-use";

export type BranchEntry = {
  readonly name: string;
  readonly worktreePath: string;
};

/**
 * Parses `git branch --list <pattern> '--format=%(refname:short)%09%(worktreepath)'`
 * output into structured entries. A branch not checked out by any worktree
 * has an empty `worktreePath`.
 */
function parseBranchListing(output: string): BranchEntry[] {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split("\n").map((line) => {
    const [name, worktreePath] = line.split("\t", 2);
    return { name: name ?? "", worktreePath: worktreePath ?? "" };
  });
}

/**
 * Parses `git worktree list --porcelain` output into the set of live
 * worktree directory basenames (e.g. `agent-a2d4c8f6ee10afe2e`).
 */
function parseWorktreeDirectoryNames(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of output.split("\n")) {
    if (!line.startsWith("worktree ")) {
      continue;
    }
    const directory = line.slice("worktree ".length).trim();
    names.add(directory.split("/").pop() ?? "");
  }
  return names;
}

export async function listBranches(pattern: string): Promise<BranchEntry[]> {
  const output =
    await Bun.$`git branch --list ${pattern} '--format=%(refname:short)%09%(worktreepath)'`.text();
  return parseBranchListing(output);
}

export async function listLiveWorktreeDirectoryNames(): Promise<Set<string>> {
  const output = await Bun.$`git worktree list --porcelain`.text();
  return parseWorktreeDirectoryNames(output);
}

export type WorktreeEntry = {
  readonly directory: string;
  readonly branch: string | null;
  /**
   * The raw text after a `locked` porcelain line — `''` for `git worktree
   * lock` with no reason given, `null` when the worktree isn't locked at
   * all. See {@link resolveWorktreeOwner} for `/forge`'s own reason format.
   */
  readonly lockedReason: string | null;
  /**
   * The commit sha from the porcelain `HEAD <sha>` line. Optional (rather
   * than always required) so existing fixtures across this repo's test
   * files — written before this field existed, and indifferent to it — stay
   * valid without every one of them being touched; `parseWorktreeEntries`
   * itself always sets it, `undefined` only when a caller builds an entry
   * by hand without it.
   */
  readonly head?: string | null;
};

/**
 * Parses `git worktree list --porcelain` into `{directory, branch,
 * lockedReason, head}` records — unlike {@link parseWorktreeDirectoryNames},
 * this keeps the full path, the branch actually checked out there (`null`
 * for a detached worktree), the commit it's at, and whether/why the
 * worktree is locked.
 */
export function parseWorktreeEntries(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let currentDirectory: string | null = null;
  let currentBranch: string | null = null;
  let currentLockedReason: string | null = null;
  let currentHead: string | null = null;

  const flush = () => {
    if (currentDirectory) {
      entries.push({
        directory: currentDirectory,
        branch: currentBranch,
        lockedReason: currentLockedReason,
        head: currentHead,
      });
    }
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      currentDirectory = line.slice("worktree ".length).trim();
      currentBranch = null;
      currentLockedReason = null;
      currentHead = null;
    } else if (line.startsWith("HEAD ")) {
      currentHead = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      currentBranch = line.slice("branch ".length).trim().replace("refs/heads/", "");
    } else if (line === "locked" || line.startsWith("locked ")) {
      currentLockedReason = line === "locked" ? "" : line.slice("locked ".length).trim();
    } else if (line.trim().length === 0) {
      flush();
      currentDirectory = null;
      currentBranch = null;
      currentLockedReason = null;
      currentHead = null;
    }
  }
  flush();

  return entries;
}

export type WorktreeOwner = {
  readonly runId: string;
  readonly ticket: string;
  readonly anchorPid: number;
  readonly at: string;
  /**
   * The coordinator's own `resolveSessionSlug()` (`runs.ts`) at the moment it
   * dispatched this worktree — an optional fifth `slug=<value>` field on top
   * of the original four, present only when whatever wrote the lock reason
   * included it. Without it, a caller classifying this owner's liveness has
   * no way to find the coordinator's *own* transcript (it lives under the
   * coordinator's project slug, not this worktree's directory — see
   * `preflight.ts`/`cleanup.ts`'s own callers), so `classifyRun`'s `'idle'`
   * verdict becomes unreachable and every anchor-less owner reads `'dead'`.
   * `undefined` when absent — callers fall back to their pre-existing
   * (directory-derived, known-wrong) slug guess for backward compatibility
   * with a lock reason written before this field existed.
   */
  readonly coordinatorSlug?: string;
};

/**
 * Parses the `git worktree lock` reason `/forge` writes at worker bootstrap
 * — `forge run=<runId> ticket=<ticket> anchor=<pid> at=<iso>` plus an
 * optional `slug=<coordinatorSlug>` — a literal `forge` token followed by
 * space-separated `key=value` pairs (safe because none of
 * `runId`/`ticket`/pid/ISO-timestamp/slug values can contain whitespace) —
 * back into structured fields. Returns `null` for anything that isn't this
 * shape: an unlocked worktree (`lockedReason` is `null`), a human's own
 * unrelated `git worktree lock '<reason>'`, or a reason missing one of the
 * four *required* keys — never throws, since encountering a non-`/forge`
 * lock is an expected, normal case. `slug` is optional precisely so a lock
 * reason written before this field existed still parses.
 */
export function resolveWorktreeOwner(entry: WorktreeEntry): WorktreeOwner | null {
  if (entry.lockedReason === null) return null;

  const tokens = entry.lockedReason.trim().split(/\s+/);
  if (tokens[0] !== "forge") return null;

  const fields = new Map<string, string>();
  for (const token of tokens.slice(1)) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) continue;
    fields.set(token.slice(0, separatorIndex), token.slice(separatorIndex + 1));
  }

  const runId = fields.get("run");
  const ticket = fields.get("ticket");
  const at = fields.get("at");
  const anchorPid = Number(fields.get("anchor"));
  if (!runId || !ticket || !at || !Number.isFinite(anchorPid)) return null;

  const coordinatorSlug = fields.get("slug");
  return {
    runId,
    ticket,
    anchorPid,
    at,
    ...(coordinatorSlug ? { coordinatorSlug } : {}),
  };
}

export async function listWorktreeEntries(): Promise<WorktreeEntry[]> {
  const output = await Bun.$`git worktree list --porcelain`.text();
  return parseWorktreeEntries(output);
}

function startsWithTicket(candidate: string, ticket: string): boolean {
  return candidate === ticket || candidate.startsWith(`${ticket}-`);
}

/**
 * Finds the reservation (from `claims.ts`'s `listReservations`) matching a
 * worker branch's full ticket id — `<branchPrefix>-<ticket-id>-<slug>` on
 * the branch side (or, when the tracker's ticket ids already start with the
 * prefix, `<ticket-id>-<slug>`), compared case-insensitively against the
 * reservation's whole ticket id, never only its trailing number. Returns `null` when the branch doesn't look like
 * a worker branch at all, or no live reservation names that ticket.
 */
export function findReservationForBranch(
  branch: string,
  branchPrefix: string,
  reservations: readonly Reservation[],
): Reservation | null {
  const lowerBranch = branch.toLowerCase();
  const prefixWithDash = `${branchPrefix.toLowerCase()}-`;
  if (!lowerBranch.startsWith(prefixWithDash)) return null;
  const afterPrefix = lowerBranch.slice(prefixWithDash.length);

  let best: Reservation | null = null;
  for (const reservation of reservations) {
    const ticket = reservation.ticket.toLowerCase();
    const matches = startsWithTicket(afterPrefix, ticket) || startsWithTicket(lowerBranch, ticket);
    if (matches && (best === null || reservation.ticket.length > best.ticket.length)) {
      best = reservation;
    }
  }
  return best;
}

/**
 * `resolveWorktreeOwner` returns `null` for an entry whose `git worktree
 * lock` reason isn't `/forge`'s own shape — the common case now that the
 * harness itself unlocks a worker's worktree the moment its agent process
 * exits (observed across real runs: a worktree locked `forge run=… ticket=…`
 * while its worker was live comes back with `lockedReason: null` shortly
 * after — see `reference/incidents.md`). Losing the lock must not mean
 * losing attribution: `ticket.branchPrefix`-scoped reservations
 * (`claims.ts`, shared host-wide via `--git-common-dir`, released only at
 * wave close-out by `forge cleanup --run`) outlive the lock and still say
 * which run owns this ticket. This tries the lock first, falling back to
 * {@link findReservationForBranch} only when the lock itself gives nothing
 * — a worktree with a *different*, unrelated lock reason (a human's own) is
 * never second-guessed by this fallback.
 */
export function resolveWorktreeOwnerWithReservations(
  entry: WorktreeEntry,
  reservations: readonly Reservation[],
  branchPrefix: string,
): WorktreeOwner | null {
  const lockOwner = resolveWorktreeOwner(entry);
  if (lockOwner) return lockOwner;
  if (entry.lockedReason !== null || !entry.branch) return null;

  const reservation = findReservationForBranch(entry.branch, branchPrefix, reservations);
  if (!reservation) return null;

  return {
    runId: reservation.runId,
    ticket: reservation.ticket,
    anchorPid: reservation.anchorPid,
    at: new Date(reservation.reservedAt).toISOString(),
    coordinatorSlug: reservation.sessionSlug,
  };
}

/**
 * `worktree-agent-<id>` branches map 1:1 to a `.claude/worktrees/agent-<id>`
 * directory. The branch itself carries no `%(worktreepath)` once the worker
 * checks out its own worker branch, so liveness has to be read from the
 * directory instead.
 */
export function isWorktreeAgentBranchLive(
  branchName: string,
  liveDirectoryNames: ReadonlySet<string>,
): boolean {
  const agentId = branchName.slice("worktree-".length);
  return liveDirectoryNames.has(agentId);
}

export interface LocalTrunkOption {
  /** True in `landing.mode` `merge`: compare against local `<trunk>`. */
  readonly local: boolean;
}

/** The ref "landed" is measured against: local `<trunk>` or `<remote>/<trunk>`. */
export function trunkReference(remote: string, trunk: string, local: boolean): string {
  return local ? trunk : `${remote}/${trunk}`;
}

/**
 * Resolves `<remote>/<trunk>`'s tree sha (e.g. `origin/main^{tree}`) —
 * `remote`/`trunk` come from a repo's `forge.config.json` (`repo.remote`,
 * `repo.trunk`; see `config.ts`), replacing what used to be a hardcoded
 * `origin/main` here. Every caller must fetch `remote` first (`cleanup.ts`
 * does, right before calling this) so classification is never made against a
 * stale local ref.
 */
export async function resolveMainTree(
  remote: string,
  trunk: string,
  { local }: LocalTrunkOption = { local: false },
): Promise<string> {
  const ref = trunkReference(remote, trunk, local);
  const output = await Bun.$`git rev-parse ${`${ref}^{tree}`}`.text();
  const tree = output.trim();
  if (tree.length === 0) {
    throw new Error(`could not resolve ${ref}'s tree — refusing to classify branches`);
  }
  return tree;
}

/**
 * `remote`/`trunk` are the same config-sourced values as
 * {@link resolveMainTree} — pass the identical pair used to compute
 * `mainTree` so the ancestor check and the merge-tree comparison agree on
 * what "merged" means.
 */
export async function classifyByContent(
  branch: string,
  mainTree: string,
  remote: string,
  trunk: string,
  { local }: LocalTrunkOption = { local: false },
): Promise<ContentVerdict> {
  const ref = trunkReference(remote, trunk, local);
  const ancestorCheck = await Bun.$`git merge-base --is-ancestor ${branch} ${ref}`
    .nothrow()
    .quiet();
  if (ancestorCheck.exitCode === 0) {
    return "merged";
  }

  const merged = await Bun.$`git merge-tree --write-tree ${ref} ${branch}`.nothrow().quiet();
  if (merged.exitCode !== 0) {
    return "conflicted";
  }
  const resultTree = merged.stdout.toString().trim().split("\n", 1)[0] ?? "";
  if (resultTree.length === 0 || mainTree.length === 0) {
    return "conflicted";
  }
  return resultTree === mainTree ? "equivalent" : "diverged";
}

export function isSafeToDelete(verdict: BranchVerdict): boolean {
  return verdict === "merged" || verdict === "equivalent";
}
