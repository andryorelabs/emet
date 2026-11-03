/**
 * Deletes the local branches a `/forge` wave leaves behind once its PR has
 * merged, and prunes stale worktree metadata. Every `worktree-agent-*` (the
 * scaffolding branch `Agent`'s `isolation: "worktree"` creates automatically)
 * and ticket-prefixed worker branch is classified by content before anything
 * is deleted: `git merge-base --is-ancestor` catches a plain merge or
 * fast-forward, and `git merge-tree --write-tree <remote>/<trunk> <branch>`
 * compared against `git rev-parse <remote>/<trunk>^{tree}` catches a squash
 * merge — this repo's actual merge style, and the one case `git cherry`
 * cannot see, since it matches patch-ids per commit and a squash collapses N
 * commits into one with a different patch-id. `remote`/`trunk` come from
 * `forge.config.json`'s `repo.remote`/`repo.trunk` (see `config.ts`) —
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
 * docs/agents/forge.md) leaves the scaffolding branch itself with an empty
 * `%(worktreepath)`, so it needs this second signal to not look abandoned.
 * `git worktree prune` runs before either signal is read, since both read the
 * same metadata and stale entries would make the guard see live worktrees as
 * gone. `git worktree prune` itself deletes no branch and no directory — it
 * only unregisters `.git/worktrees/<id>` entries whose directory is already
 * gone — so it stays unconditional and always runs first, confirmed safe by
 * an adversarial review of AO-260.
 *
 * **Run scoping (AO-260) — concurrent `/forge` sessions never delete each
 * other's branches.** Every worktree a `/forge` worker bootstraps is
 * `git worktree lock`ed with a reason of the shape
 * `forge run=<runId> ticket=<ticket> anchor=<pid> at=<iso>`
 * ({@link resolveWorktreeOwner}, `worktrees.ts`). A locked worktree is
 * never a deletion candidate, full stop, regardless of what content
 * classification says about the branch it holds ({@link guardBranch}) — the
 * classifier is never even consulted for one. `--run <id>` scopes the whole
 * sweep to branches whose still-locked worktree resolves to that run id,
 * releasing the ticket's reservation (`claims.ts`) after each
 * successful deletion, and — once branch cleanup is done — every worker slot
 * (`slots.ts`) that run still holds, so a wave's `FORGE_MAX_LIVE_WORKERS`
 * capacity is freed back up without the coordinator having to track which
 * indices it acquired. With no `--run` (the default) or the explicit,
 * synonymous `--all`, every branch in the repo is swept as before, but a
 * locked worktree whose owning run classifies (`classifyRun`,
 * `runs.ts`) as `'live'` or `'idle'` is skipped and reported
 * separately from a `'dead'` owner or a non-`/forge` lock reason, which both
 * fall into a generic "locked, protected" bucket — either way, never
 * deleted.
 *
 * Classification happens in a first pass with no mutations; deletion only
 * starts once every branch has a verdict, so a `git` error midway through
 * never leaves the repo in a half-cleaned state. Pass `--dry-run` to print
 * the plan without deleting anything.
 */
import { optionalProperty } from './optional'
import path from 'node:path'

import { configureTicketPattern, releaseTicket } from './claims'
import {
  ForgeConfigError,
  requireForgeConfig,
  resolveRepoRoot,
  type ForgeConfig,
} from './config'
import {
  classifyRun,
  resolveIdleThresholdMs,
  resolveSessionSlug,
  type RunVerdict,
} from './runs'
import { releaseAllSlotsForRun } from './slots'
import {
  type BranchVerdict,
  classifyByContent,
  isSafeToDelete,
  isWorktreeAgentBranchLive,
  listBranches,
  listLiveWorktreeDirectoryNames,
  listWorktreeEntries,
  resolveMainTree,
  resolveWorktreeOwner,
  type WorktreeEntry,
  type WorktreeOwner,
} from './worktrees'

export type CleanupCategory =
  | 'in-use'
  | 'to-delete'
  | 'needs-review'
  | 'locked-protected'
  | 'live-or-idle-protected'
  | 'out-of-scope'

type ClassifiedBranch = {
  readonly name: string
  readonly category: CleanupCategory
  readonly contentVerdict?: BranchVerdict
  readonly ownerRunId?: string
  readonly ownerTicket?: string
  readonly runVerdict?: RunVerdict
}

export type CleanupOptions = {
  readonly dryRun: boolean
  readonly runId: string | null
  readonly all: boolean
  readonly force: boolean
}

/**
 * `--run <id>` scopes classification/deletion to branches owned by that
 * run's still-locked worktree (see {@link guardBranch}); `--all` is an
 * explicit, self-documenting synonym for the same repo-wide sweep that used
 * to run with no scope flag at all — both apply the same live/idle-owner
 * guard, so the two are mutually exclusive rather than composable. `--dry-run`
 * is unchanged from before AO-260.
 *
 * **Exactly one of `--run`/`--all` is now required.** Before this, the bare
 * `forge cleanup` (no flags at all — including `forge cleanup --dry-run`) was
 * silently the full repo-wide sweep, indistinguishable at the call site from
 * a coordinator that forgot `--run <runId>` — and `docs/agents/forge.md`
 * only ever documents the `--run`-scoped form. Two coordinators running in
 * different git worktrees of the same repo (e.g. two Orca worktrees) sharing
 * one branch/worktree namespace makes that easy typo actively destructive:
 * an unscoped sweep can force-delete a sibling coordinator's already-merged
 * branch (AO-260's own protections only cover *locked* worktrees, not a
 * branch whose worktree already closed). Failing closed here means "clean up
 * everything" now has to be said on purpose.
 *
 * `--force` has been advertised by `docs/agents/forge.md` and this script's
 * own preflight sibling for a long time without ever actually being parsed
 * here — this is the fix. It lifts protection on exactly one case: a locked
 * worktree whose owning run {@link classifyRun} resolves to `'dead'` (see
 * {@link guardBranch}). It does nothing for a branch checked out by a live
 * worktree, a lock this parser can't attribute to any run, or a `'live'`/
 * `'idle'` owner — those stay protected regardless.
 */
export function parseCleanupArguments(argv: readonly string[]): CleanupOptions {
  const isDryRun = argv.includes('--dry-run')
  const isAll = argv.includes('--all')
  const isForce = argv.includes('--force')

  const runIndex = argv.indexOf('--run')
  let runId: string | null = null
  if (runIndex !== -1) {
    const value = argv[runIndex + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(
        'forge:cleanup — --run requires a value, e.g. --run session_abc123',
      )
    }
    runId = value
  }

  if (runId !== null && isAll) {
    throw new Error('forge:cleanup — --run and --all are mutually exclusive')
  }

  if (runId === null && !isAll) {
    throw new Error(
      'forge:cleanup — pass --run <runId> to clean up this run only, or --all for a deliberate repo-wide sweep.',
    )
  }

  return { dryRun: isDryRun, runId, all: isAll, force: isForce }
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
  const direct = entries.find((entry) => entry.branch === branchName)
  if (direct) return direct
  if (!branchName.startsWith('worktree-')) return undefined
  const agentId = branchName.slice('worktree-'.length)
  return entries.find((entry) => path.basename(entry.directory) === agentId)
}

export type GuardOutcome =
  | {
      readonly done: true
      readonly category: Exclude<CleanupCategory, 'to-delete' | 'needs-review'>
      readonly ownerRunId?: string
      readonly runVerdict?: RunVerdict
    }
  | { readonly done: false; readonly owner: WorktreeOwner | null }

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
 * `'dead'` owner or an unparseable (non-`/forge`) lock reason, both of which
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
  if (isBaselineLive) return { done: true, category: 'in-use' }

  if (!matchedEntry || matchedEntry.lockedReason === null) {
    return runId === null
      ? { done: false, owner: null }
      : { done: true, category: 'out-of-scope' }
  }

  const owner = resolveWorktreeOwner(matchedEntry)

  if (runId !== null) {
    return owner && owner.runId === runId
      ? { done: false, owner }
      : { done: true, category: 'out-of-scope' }
  }

  if (!owner) return { done: true, category: 'locked-protected' }

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
  )
  if (verdict === 'dead') {
    return force
      ? { done: false, owner }
      : { done: true, category: 'locked-protected' }
  }
  return {
    done: true,
    category: 'live-or-idle-protected',
    ownerRunId: owner.runId,
    runVerdict: verdict,
  }
}

async function classifyOneBranch(
  name: string,
  isBaselineLive: boolean,
  matchedEntry: WorktreeEntry | undefined,
  runId: string | null,
  mainTree: string,
  remote: string,
  trunk: string,
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
  )
  if (guard.done) {
    return {
      name,
      category: guard.category,
      ...optionalProperty('ownerRunId', guard.ownerRunId),
      ...optionalProperty('runVerdict', guard.runVerdict),
    }
  }
  const contentVerdict = await classifyByContent(name, mainTree, remote, trunk)
  return {
    name,
    category: isSafeToDelete(contentVerdict) ? 'to-delete' : 'needs-review',
    contentVerdict,
    ...optionalProperty('ownerTicket', guard.owner?.ticket),
    ...optionalProperty('ownerRunId', guard.owner?.runId),
  }
}

async function deleteBranch(
  branch: string,
): Promise<{ ok: boolean; message: string }> {
  const result = await Bun.$`git branch -D ${branch}`.nothrow().quiet()
  if (result.exitCode === 0) {
    return { ok: true, message: branch }
  }
  return {
    ok: false,
    message: `${branch} — ${result.stderr.toString().trim()}`,
  }
}

/**
 * Wraps {@link deleteBranch} with reservation cleanup (AO-260 point 1): once
 * a branch is actually gone, its ticket's claim in the registry
 * (T1b, `claims.ts`) is stale and must go with it, or a finished ticket
 * would look permanently reserved to the next `/forge` coordinator. Never
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
  const result = await deleteFunction(branchName)
  if (ticket && ownerRunId && result.ok) {
    await releaseFunction(ticket, ownerRunId)
  }
  return result
}

async function main(config: ForgeConfig) {
  const { dryRun, runId, all, force } = parseCleanupArguments(
    process.argv.slice(2),
  )
  const { remote, trunk } = config.repo
  const branchPrefix = config.ticket.branchPrefix
  const idleThresholdMs = resolveIdleThresholdMs(config)

  console.log(
    `Using ${remote}/${trunk} (from forge.config.json's repo.remote/repo.trunk) as the merge-base reference.`,
  )

  /**
   * Skipped under --dry-run: a dry run must only report, never mutate git's
   * own admin state. `git worktree prune` deletes no branch and no
   * directory (see the file-level comment above), but it does rewrite
   * `.git/worktrees/*` — a real mutation a "would delete" preview has no
   * business making. `git fetch` still runs either way: the merge-base
   * reference the dry-run report itself relies on needs it.
   */
  if (!dryRun) {
    await Bun.$`git worktree prune`.nothrow().quiet()
  }
  await Bun.$`git fetch --quiet ${remote} ${trunk}`.nothrow().quiet()

  const trunkRef = `${remote}/${trunk}`
  const mainShaResult = await Bun.$`git rev-parse ${trunkRef}`.nothrow().quiet()
  if (mainShaResult.exitCode !== 0) {
    throw new ForgeConfigError(
      `forge cleanup: could not resolve ${trunkRef} — check forge.config.json's repo.remote/repo.trunk and that you've fetched.`,
    )
  }
  const mainSha = mainShaResult.stdout.toString().trim()
  const mainTree = await resolveMainTree(remote, trunk)
  const liveWorktreeDirectoryNames = await listLiveWorktreeDirectoryNames()
  const worktreeEntries = await listWorktreeEntries()

  const worktreeAgentBranches = await listBranches('worktree-agent-*')
  const aoBranches = await listBranches(`${branchPrefix}-*`)

  const classified: ClassifiedBranch[] = []
  for (const entry of worktreeAgentBranches) {
    const isBaselineLive = isWorktreeAgentBranchLive(
      entry.name,
      liveWorktreeDirectoryNames,
    )
    const matchedEntry = findWorktreeEntryForBranch(entry.name, worktreeEntries)
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
        force,
        idleThresholdMs,
      ),
    )
  }
  for (const entry of aoBranches) {
    const isBaselineLive = entry.worktreePath.length > 0
    const matchedEntry = findWorktreeEntryForBranch(entry.name, worktreeEntries)
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
        force,
        idleThresholdMs,
      ),
    )
  }

  const scopeLabel = runId
    ? ` — run ${runId}`
    : all
      ? ' — explicit repo-wide sweep'
      : ''
  console.log(
    `forge:cleanup — ${trunkRef} ${mainSha}${dryRun ? ' (dry run)' : ''}${scopeLabel}\n`,
  )

  const toDelete = classified.filter(
    (branch) => branch.category === 'to-delete',
  )
  const inUse = classified.filter((branch) => branch.category === 'in-use')
  const needsReview = classified.filter(
    (branch) => branch.category === 'needs-review',
  )
  const liveOrIdleProtected = classified.filter(
    (branch) => branch.category === 'live-or-idle-protected',
  )
  const lockedProtected = classified.filter(
    (branch) => branch.category === 'locked-protected',
  )
  const outOfScope = classified.filter(
    (branch) => branch.category === 'out-of-scope',
  )

  if (dryRun) {
    for (const branch of toDelete) {
      console.log(`Would delete: ${branch.name} (${branch.contentVerdict})`)
    }
  } else {
    const deleted: string[] = []
    const failed: string[] = []
    for (const branch of toDelete) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const result = await deleteAndReleaseTicket(
        branch.name,
        branch.ownerTicket,
        branch.ownerRunId,
        deleteBranch,
        releaseTicket,
      )
      if (result.ok) {
        deleted.push(`${result.message} (${branch.contentVerdict})`)
      } else {
        failed.push(result.message)
      }
    }
    console.log(`Deleted ${deleted.length} branch(es):`)
    for (const message of deleted) {
      console.log(`  - ${message}`)
    }
    if (failed.length > 0) {
      console.log(`\nFailed to delete ${failed.length} branch(es):`)
      for (const message of failed) {
        console.log(`  - ${message}`)
      }
      process.exitCode = 1
    }
  }

  if (inUse.length > 0) {
    console.log(`\nKept ${inUse.length} branch(es) held by a live worktree:`)
    for (const branch of inUse) {
      console.log(`  - ${branch.name}`)
    }
  }

  if (needsReview.length > 0) {
    console.log(
      `\nKept ${needsReview.length} branch(es) with unmerged or unresolved work — review, then delete by hand:`,
    )
    for (const branch of needsReview) {
      console.log(
        `  - ${branch.name} (${branch.contentVerdict}) — git branch -D ${branch.name}`,
      )
    }
  }

  if (liveOrIdleProtected.length > 0) {
    console.log(
      `\nSkipped ${liveOrIdleProtected.length} branch(es) — owning run is still active, protected:`,
    )
    for (const branch of liveOrIdleProtected) {
      console.log(
        `  - ${branch.name} (run ${branch.ownerRunId}, ${branch.runVerdict})`,
      )
    }
  }

  if (lockedProtected.length > 0) {
    console.log(
      `\nSkipped ${lockedProtected.length} branch(es) — worktree is locked, protected:`,
    )
    for (const branch of lockedProtected) {
      console.log(`  - ${branch.name}`)
    }
  }

  if (outOfScope.length > 0) {
    console.log(
      `\n${outOfScope.length} branch(es) out of scope for run ${runId} — not touched.`,
    )
  }

  if (runId && !dryRun) {
    const releasedSlots = await releaseAllSlotsForRun(runId)
    if (releasedSlots.length > 0) {
      console.log(
        `\nReleased ${releasedSlots.length} worker slot(s) for run ${runId}: ${releasedSlots.join(', ')}.`,
      )
    }
  }

  console.log(
    dryRun
      ? '\nDry run — nothing was deleted.'
      : '\ngit worktree prune complete.',
  )
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `cleanup` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 * `cleanup` deletes branches, so — like `preflight` — a missing or malformed
 * `forge.config.json` is always fatal (exit 2), never a silent fall back to
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
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv]
  try {
    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) {
      throw new ForgeConfigError('forge cleanup: not inside a git repository')
    }
    const config = await requireForgeConfig(repoRoot)
    /**
     * `deleteAndReleaseTicket` below calls `claims.ts`'s `releaseTicket`,
     * which validates against `claims.ts`'s module-level `TICKET_PATTERN`
     * (default: the generic `AO-<digits>`-shaped pattern). Without this call,
     * a repo with a differently-shaped `ticket.idPattern` (e.g. a numeric
     * `^#?\d+$` github/local id) throws mid-sweep — after some branches are
     * already deleted, before `releaseAllSlotsForRun` ever runs — leaking
     * that run's worker slots. `claims.ts`'s own `run()` configures this for
     * itself; `cleanup.ts` must do the same since it calls into that module
     * directly rather than through the `forge claims` CLI entry point.
     */
    configureTicketPattern(config.ticket.idPattern)
    await main(config)
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message)
      process.exitCode = 2
      return
    }
    console.error(error)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
