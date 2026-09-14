import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

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
import { isSlotStale, resolveSlotsDirectory } from './slots'
import {
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

/**
 * Local git/filesystem hygiene checks that must pass before `/forge`
 * dispatches its next wave of worktree workers. Read-only — this script
 * makes no changes, it only reports pass/fail per check. Deliberately
 * dependency-light: it never touches the Linear API, since that's a
 * separate, more expensive check `/forge`'s own Phase 0 already does by
 * reading the docs.
 *
 * `/forge` worktrees now carry their own liveness signal: `forge-runs.ts`'s
 * {@link classifyRun} walks a worktree's owning run's anchor process (via
 * `resolveWorktreeOwner`'s parse of the `git worktree lock` reason each
 * worker writes at bootstrap, see `docs/agents/forge.md`) to tell a run
 * that's genuinely still going from one abandoned by a crashed or skipped
 * `forge:cleanup`. Only a worktree with no `/forge` lock reason at all
 * (pre-existing worktrees, or an ordinary interactive worktree unrelated to
 * `/forge`) falls back to `forge-cleanup.ts`'s own merge/equivalence
 * classifier ({@link classifyByContent}).
 */

function readPositiveIntEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readFlagValue(flag: string): string | undefined {
  const flagIndex = process.argv.indexOf(flag)
  if (flagIndex === -1) return undefined
  return process.argv[flagIndex + 1]
}

/**
 * `FORGE_MAX_LIVE_WORKERS` still overrides `forge.config.json`'s
 * `concurrency.maxLiveWorkers` when set — same precedence `slots.ts` already
 * honors, kept so the existing escape hatch never breaks.
 */
function resolveMaxLiveWorkers(config: ForgeConfig): number {
  return readPositiveIntEnvironment(
    'FORGE_MAX_LIVE_WORKERS',
    config.concurrency.maxLiveWorkers,
  )
}

/**
 * Max agents `/forge` dispatches within a single wave — see
 * docs/agents/forge.md's "Concurrency" section. The cap check below fails
 * unless at least this many slots are free. Sourced from
 * `forge.config.json`'s `concurrency.waveSize` (no env override — none
 * existed before this config field did).
 */
function resolveWaveSize(config: ForgeConfig): number {
  return config.concurrency.waveSize
}

export type WorktreeEntryVerdict =
  | { readonly kind: 'detached'; readonly entry: WorktreeEntry }
  | {
      readonly kind: 'own-run-leftover'
      readonly entry: WorktreeEntry
      readonly owner: WorktreeOwner
    }
  | {
      readonly kind: 'other-run-live'
      readonly entry: WorktreeEntry
      readonly owner: WorktreeOwner
    }
  | {
      readonly kind: 'idle'
      readonly entry: WorktreeEntry
      readonly owner: WorktreeOwner
    }
  | {
      readonly kind: 'dead'
      readonly entry: WorktreeEntry
      readonly owner: WorktreeOwner
    }
  | {
      readonly kind: 'content-fallback'
      readonly entry: WorktreeEntry
      readonly branch: string
    }

/**
 * Decides what one `.claude/worktrees/` entry means for preflight. A
 * detached worktree (no branch checked out) always needs a human. An
 * unowned entry (no `/forge` lock reason — pre-T1b, or an ordinary
 * interactive worktree doing unrelated feature work) falls back to
 * `classifyByContent`, decided by the caller since that classification is
 * async and git-backed. An owned entry defers to `classifyOwnerRun` (real
 * callers pass `classifyRun` from `forge-runs.ts`; tests inject a fake) to
 * decide between four outcomes: a `'live'` owner matching the caller's own
 * `--run` is this run's own leftover from an interrupted attempt — still a
 * failure; a `'live'` owner that doesn't match (or no `--run` was given at
 * all) is informational only; `'idle'` is a warning, never a failure;
 * `'dead'` is reported as reclaimable, never a hard failure on its own.
 */
export function classifyWorktreeEntry(
  entry: WorktreeEntry,
  currentRunId: string | undefined,
  classifyOwnerRun: (owner: WorktreeOwner) => RunVerdict,
): WorktreeEntryVerdict {
  if (!entry.branch) return { kind: 'detached', entry }

  const owner = resolveWorktreeOwner(entry)
  if (!owner) return { kind: 'content-fallback', entry, branch: entry.branch }

  const runVerdict = classifyOwnerRun(owner)
  if (runVerdict === 'live') {
    return owner.runId === currentRunId
      ? { kind: 'own-run-leftover', entry, owner }
      : { kind: 'other-run-live', entry, owner }
  }
  if (runVerdict === 'idle') return { kind: 'idle', entry, owner }
  return { kind: 'dead', entry, owner }
}

/**
 * `forge init` writes a `TODO(forge):` marker into a generated
 * `docs/agents/*.md` file for anything it couldn't infer on its own — a
 * shared singleton resource, schema/migration ownership, a Linear team key
 * (see `src/init.ts`'s templates). A repo that still carries one hasn't
 * finished being set up: dispatching against it would mean `/forge` silently
 * guessing at something a human was supposed to fill in, exactly the
 * half-initialized-repo failure mode this check exists to block. Pure over
 * already-read file content so it's testable without touching disk.
 */
export function findTodoMarkers(fileName: string, content: string): string[] {
  return content
    .split('\n')
    .map((line, index) => ({ text: line.trim(), number: index + 1 }))
    .filter(({ text }) => text.includes('TODO(forge):'))
    .map(({ text, number }) => `${fileName}:${number}: ${text}`)
}

/**
 * Scans every `docs/agents/*.md` file (not just `forge.md` — `forge init`'s
 * own templates also leave `TODO(forge):` markers in `issue-tracker.md` and
 * `domain.md`, so a check scoped to a single file would miss most of them)
 * for a leftover marker. Missing `docs/agents/` entirely is not itself a
 * failure here — that's a separate, pre-existing concern this check doesn't
 * own.
 */
export async function findTodoMarkersInDocsAgents(repoRoot: string): Promise<string[]> {
  const docsAgentsDirectory = path.join(repoRoot, 'docs', 'agents')
  if (!existsSync(docsAgentsDirectory)) return []
  const entries = await readdir(docsAgentsDirectory)
  const markers: string[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const filePath = path.join(docsAgentsDirectory, entry)
    const content = await Bun.file(filePath).text()
    markers.push(...findTodoMarkers(`docs/agents/${entry}`, content))
  }
  return markers
}

export type SlotCapacityCheck = {
  readonly freeCount: number
  readonly cap: number
  readonly waveSize: number
  readonly ok: boolean
}

/**
 * Can this wave's up to `waveSize` workers each claim a free slot right
 * now? Counting live claims and then deciding to dispatch would be
 * read-then-write, not atomic, and would race across two coordinators
 * checking at the same moment — the actual fix for that (N slots acquired
 * one at a time via `forge-slots.ts`'s `acquireSlot`, immediately before
 * each worker's `Agent` call) belongs to dispatch time (Phase 6), out of
 * this script's scope. This only answers the capacity question ahead of
 * time; it never acquires or releases a slot itself. `isSlotFree` is
 * injected so tests can simulate "slots free" and "slots exhausted" without
 * touching the filesystem — production passes the negation of
 * `forge-slots.ts`'s {@link isSlotStale} over each of
 * `<git-common-dir>/forge/slots/<index>`.
 */
export function checkSlotCapacity(
  cap: number,
  waveSize: number,
  isSlotFree: (slotIndex: number) => boolean,
): SlotCapacityCheck {
  let freeCount = 0
  for (let index = 0; index < cap; index++) {
    if (isSlotFree(index)) freeCount++
  }
  return { freeCount, cap, waveSize, ok: freeCount >= waveSize }
}

type WorktreeEntryReport = {
  readonly bucket: 'fail' | 'info' | 'warn'
  readonly line: string
}

/**
 * Turns one {@link WorktreeEntryVerdict} into a bucketed, printable line —
 * split out of `main()`'s loop (rather than a `switch` directly inside the
 * `for`) since `unicorn/no-break-in-nested-loop` flags a `break` nested two
 * levels deep as ambiguous. `'fail'` blocks dispatch; `'info'`/`'warn'`
 * never do.
 */
async function describeWorktreeEntryVerdict(
  entry: WorktreeEntry,
  verdict: WorktreeEntryVerdict,
  mainTree: string,
  remote: string,
  trunk: string,
): Promise<WorktreeEntryReport> {
  switch (verdict.kind) {
    case 'detached': {
      return {
        bucket: 'fail',
        line: `  ${entry.directory}: detached, no branch — needs human review`,
      }
    }
    case 'own-run-leftover': {
      return {
        bucket: 'fail',
        line: `  ${entry.directory} (${entry.branch}): live — this run's own leftover from an interrupted attempt (run ${verdict.owner.runId}, ticket ${verdict.owner.ticket}) — run "forge cleanup --run ${verdict.owner.runId}" to clear it`,
      }
    }
    case 'other-run-live': {
      return {
        bucket: 'info',
        line: `  ${entry.directory} (${entry.branch}): live — owned by run ${verdict.owner.runId}, ticket ${verdict.owner.ticket}`,
      }
    }
    case 'idle': {
      return {
        bucket: 'warn',
        line: `  ${entry.directory} (${entry.branch}): idle since ${verdict.owner.at} — owned by run ${verdict.owner.runId}, ticket ${verdict.owner.ticket} (not blocking dispatch)`,
      }
    }
    case 'dead': {
      return {
        bucket: 'info',
        line: `  ${entry.directory} (${entry.branch}): dead — reclaimable via "forge cleanup --run ${verdict.owner.runId} --force" (or --all --force if abandoned)`,
      }
    }
    case 'content-fallback': {
      const contentVerdict = await classifyByContent(
        verdict.branch,
        mainTree,
        remote,
        trunk,
      )
      const trunkRef = `${remote}/${trunk}`
      const advice = isSafeToDelete(contentVerdict)
        ? `looks merged/equivalent to ${trunkRef} — safe to run "forge cleanup"`
        : `${contentVerdict} from ${trunkRef} — needs human review before cleanup, work could be lost`
      return {
        bucket: 'fail',
        line: `  ${entry.directory} (${verdict.branch}): ${advice}`,
      }
    }
  }
}

export type PostDispatchFailure = {
  readonly kind:
    | 'duplicate-ticket-worktree'
    | 'duplicate-ao-branch-number'
    | 'unlocked-past-deadline'
    | 'branch-ticket-mismatch'
  readonly message: string
}

/**
 * Extracts a ticket's numeric suffix (`AO-321` → `321`, `NFK-42` → `42`) —
 * every tracker adapter's id shape (`docs/agents/forge.md`'s "Generalizing
 * /forge") is `<PREFIX>-<digits>`, so this stays a fixed shape regardless of
 * the configured `ticket.idPattern`, which only varies the prefix.
 */
function ticketNumber(ticket: string): string | null {
  const match = /-(\d+)$/.exec(ticket)
  return match ? (match[1] ?? null) : null
}

/**
 * A worker's own branch convention (`docs/agents/forge.md`'s "Branch and
 * commit convention") is `<branchPrefix>-<n>-<slug>` — this checks that a
 * worktree's checked-out branch actually names the same ticket number its
 * own lock declares, so a shell mis-routed to the wrong worktree fails
 * loudly instead of silently committing under someone else's ticket.
 * `branchPrefix` defaults to `'ao'` (andryore-dev's own convention, and this
 * module's default before `forge.config.json`'s `ticket.branchPrefix`
 * existed) so every existing call site and test stays valid unchanged.
 */
export function isBranchMatchingTicket(
  branch: string,
  ticket: string,
  branchPrefix = 'ao',
): boolean {
  const number = ticketNumber(ticket)
  if (!number) return false
  return (
    branch === `${branchPrefix}-${number}` ||
    branch.startsWith(`${branchPrefix}-${number}-`)
  )
}

/**
 * Groups `.claude/worktrees/` entries by the ticket their own `git worktree
 * lock` reason declares, keeping only groups with more than one member — the
 * AO-281 wave 2 failure mode: two worktrees claiming the same ticket, with
 * nothing distinguishing the canonical one from the duplicate.
 */
export function findDuplicateTicketWorktrees(
  entries: readonly WorktreeEntry[],
): Map<string, WorktreeEntry[]> {
  const byTicket = new Map<string, WorktreeEntry[]>()
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry)
    if (!owner) continue
    const group = byTicket.get(owner.ticket) ?? []
    group.push(entry)
    byTicket.set(owner.ticket, group)
  }
  for (const [ticket, group] of byTicket) {
    if (group.length < 2) byTicket.delete(ticket)
  }
  return byTicket
}

/**
 * Groups `ao-<n>-*` branch names by their numeric ticket id, keeping only
 * groups with more than one member — catches the observed
 * `ao-284-starred-page` vs. `ao-284-starred-page-fixes` case, two branches
 * for the same ticket that {@link findDuplicateTicketWorktrees} alone can't
 * see once only one of them still has a live, locked worktree.
 */
export function findDuplicateAoBranchNumbers(
  branchNames: readonly string[],
  branchPrefix = 'ao',
): Map<string, string[]> {
  const byNumber = new Map<string, string[]>()
  const branchPattern = new RegExp(`^${branchPrefix}-(\\d+)-`)
  for (const name of branchNames) {
    const match = branchPattern.exec(name)
    const number = match?.[1]
    if (!number) continue
    const group = byNumber.get(number) ?? []
    group.push(name)
    byNumber.set(number, group)
  }
  for (const [number, group] of byNumber) {
    if (group.length < 2) byNumber.delete(number)
  }
  return byNumber
}

/**
 * `.claude/worktrees/` entries with no `git worktree lock` at all, more than
 * `maxAgeMs` past the caller-supplied reference time — the AO-321 case:
 * bootstrap step 0 (`reference/worker-prompt.md`, whose reason string comes
 * from `forge lock-reason`) was skipped, so `resolveWorktreeOwner` can never
 * attribute the worktree to a run and neither `forge cleanup` nor this
 * module's default mode can tell a canonical worktree from a duplicate.
 * `statMtimeMs` is injected (rather
 * than a direct `statSync` call) so tests can simulate ages without
 * touching the filesystem; production passes the directory's own mtime as a
 * stand-in for "time since this dispatch created it" — reasonable since this
 * audit only ever runs immediately after a dispatch, so any not-yet-locked
 * worktree under `.claude/worktrees/` was necessarily just created by it.
 */
export function findWorktreesMissingLockPastDeadline(
  entries: readonly WorktreeEntry[],
  maxAgeMs: number,
  nowMs: number,
  statMtimeMs: (directory: string) => number | null,
): WorktreeEntry[] {
  return entries.filter((entry) => {
    if (entry.lockedReason !== null) return false
    const mtimeMs = statMtimeMs(entry.directory)
    if (mtimeMs === null) return false
    return nowMs - mtimeMs > maxAgeMs
  })
}

/**
 * The four post-dispatch gates from `docs/agents/forge.md` — run once,
 * immediately after a wave's batch of parallel `Agent` calls returns, before
 * any worker has had a chance to commit. Unlike the default preflight mode
 * above (which only ever warns/informs about a live worktree), every finding
 * here is a hard failure: each one means dispatch itself went wrong, not
 * that a long-running worker is merely still in flight.
 */
export function auditPostDispatch(
  entries: readonly WorktreeEntry[],
  aoBranchNames: readonly string[],
  options: {
    readonly maxUnlockedAgeMs: number
    readonly nowMs: number
    readonly statMtimeMs: (directory: string) => number | null
    /** `ticket.branchPrefix` from `forge.config.json` — defaults to `'ao'`
     * (andryore-dev's own convention) so existing calls stay valid. */
    readonly branchPrefix?: string
  },
): PostDispatchFailure[] {
  const branchPrefix = options.branchPrefix ?? 'ao'
  const failures: PostDispatchFailure[] = []

  for (const [ticket, group] of findDuplicateTicketWorktrees(entries)) {
    failures.push({
      kind: 'duplicate-ticket-worktree',
      message: `${ticket} is claimed by ${group.length} worktrees — pick the canonical one, delete/re-lock the rest:\n${group.map((entry) => `  ${entry.directory} (${entry.branch ?? 'detached'}, HEAD ${entry.head ?? 'unknown'})`).join('\n')}`,
    })
  }

  for (const [number, names] of findDuplicateAoBranchNumbers(
    aoBranchNames,
    branchPrefix,
  )) {
    failures.push({
      kind: 'duplicate-ao-branch-number',
      message: `Ticket ${branchPrefix.toUpperCase()}-${number} has ${names.length} branches: ${names.join(', ')} — one of these was created in error.`,
    })
  }

  for (const entry of findWorktreesMissingLockPastDeadline(
    entries,
    options.maxUnlockedAgeMs,
    options.nowMs,
    options.statMtimeMs,
  )) {
    failures.push({
      kind: 'unlocked-past-deadline',
      message: `${entry.directory} has no git worktree lock ${Math.round(options.maxUnlockedAgeMs / 1000)}s+ after dispatch — the worker skipped bootstrap step 0. Re-lock it with: git worktree lock ${entry.directory} --reason "$(forge lock-reason --run <runId> --ticket <ticket>)"`,
    })
  }

  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry)
    if (!owner || !entry.branch) continue
    if (!isBranchMatchingTicket(entry.branch, owner.ticket, branchPrefix)) {
      failures.push({
        kind: 'branch-ticket-mismatch',
        message: `${entry.directory} is checked out on branch ${entry.branch}, but its own lock names ticket ${owner.ticket} — a shell was likely routed to the wrong worktree.`,
      })
    }
  }

  return failures
}

/**
 * Generous relative to how fast `git worktree lock` actually runs
 * (sub-second) — this only exists to give a worker's own bootstrap script a
 * fair chance to reach bootstrap step 0 before the coordinator's audit runs,
 * not to model any real expected latency.
 */
const POST_DISPATCH_UNLOCKED_MAX_AGE_MS = 30_000

/**
 * `--post-dispatch` mode. `--run <runId>` is accepted (so the exact command
 * `docs/agents/forge.md` documents never errors) but not required and not
 * used to scope detection: an unlocked worktree can't be attributed to any
 * run at all (that's the whole problem, see
 * {@link findWorktreesMissingLockPastDeadline}), and a duplicate ticket or
 * branch number is a failure regardless of which run(s) created the
 * duplicates.
 */
async function mainPostDispatch(config: ForgeConfig): Promise<void> {
  const branchPrefix = config.ticket.branchPrefix
  const allWorktreeEntries = await listWorktreeEntries()
  const worktreeEntries = allWorktreeEntries.filter((entry) =>
    entry.directory.includes('.claude/worktrees/'),
  )
  const ticketBranches = await listBranches(`${branchPrefix}-*`)

  const failures = auditPostDispatch(
    worktreeEntries,
    ticketBranches.map((branch) => branch.name),
    {
      maxUnlockedAgeMs: POST_DISPATCH_UNLOCKED_MAX_AGE_MS,
      nowMs: Date.now(),
      statMtimeMs: (directory) => {
        try {
          return statSync(directory).mtimeMs
        } catch {
          return null
        }
      },
      branchPrefix,
    },
  )

  if (failures.length > 0) {
    console.error('forge:preflight --post-dispatch failed:\n')
    for (const failure of failures) {
      console.error(`- ${failure.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `forge:preflight --post-dispatch OK — ${worktreeEntries.length} worktree(s) checked, no ticket/branch duplicates, no unlocked stragglers.`,
  )
}

async function main(config: ForgeConfig, repoRoot: string) {
  const currentRunId = readFlagValue('--run')
  const failures: string[] = []
  const infoLines: string[] = []
  const warnLines: string[] = []

  for (const required of config.preflight.requiredFiles) {
    if (!existsSync(path.join(repoRoot, required.path))) {
      failures.push(`${required.path} is missing at the repo root — ${required.why}`)
    }
  }

  const todoMarkers = await findTodoMarkersInDocsAgents(repoRoot)
  if (todoMarkers.length > 0) {
    failures.push(
      `docs/agents/ still has ${todoMarkers.length} TODO(forge): marker(s) — fill these in (or run "forge init --force" after resolving them) before dispatching:\n${todoMarkers.map((m) => `  ${m}`).join('\n')}`,
    )
  }

  const liveWorktreeDirectoryNames = await listLiveWorktreeDirectoryNames()

  const worktreeAgentBranches = await listBranches('worktree-agent-*')
  const orphanedScaffoldBranches = worktreeAgentBranches.filter(
    (branch) =>
      !isWorktreeAgentBranchLive(branch.name, liveWorktreeDirectoryNames),
  )
  if (orphanedScaffoldBranches.length > 0) {
    failures.push(
      `Orphaned worktree-agent-* scaffold branches (their worktree is already gone — always safe to delete) — run "forge cleanup":\n${orphanedScaffoldBranches.map((b) => `  ${b.name}`).join('\n')}`,
    )
  }

  const allWorktreeEntries = await listWorktreeEntries()
  const worktreeEntries = allWorktreeEntries.filter((entry) =>
    entry.directory.includes('.claude/worktrees/'),
  )
  if (worktreeEntries.length > 0) {
    const mainTree = await resolveMainTree(config.repo.remote, config.repo.trunk)
    const idleThresholdMs = resolveIdleThresholdMs(config)
    const worktreeFailLines: string[] = []

    for (const entry of worktreeEntries) {
      const verdict = classifyWorktreeEntry(entry, currentRunId, (owner) =>
        classifyRun(
          owner.anchorPid,
          // The coordinator's transcript lives under *its own* project
          // slug, not this worktree's directory — see `WorktreeOwner`'s doc
          // comment (worktrees.ts). Fall back to the directory-derived guess
          // only for a lock reason written before `slug=` existed.
          owner.coordinatorSlug ?? resolveSessionSlug(entry.directory),
          owner.runId,
          { idleThresholdMs },
        ),
      )
      const report = await describeWorktreeEntryVerdict(
        entry,
        verdict,
        mainTree,
        config.repo.remote,
        config.repo.trunk,
      )
      if (report.bucket === 'fail') worktreeFailLines.push(report.line)
      else if (report.bucket === 'info') infoLines.push(report.line)
      else warnLines.push(report.line)
    }

    if (worktreeFailLines.length > 0) {
      failures.push(
        `.claude/worktrees/ has entries needing attention:\n${worktreeFailLines.join('\n')}`,
      )
    }
  }

  const slotsDirectory = await resolveSlotsDirectory()
  const capacityCheck = checkSlotCapacity(
    resolveMaxLiveWorkers(config),
    resolveWaveSize(config),
    (index) => isSlotStale(slotsDirectory, index),
  )
  if (!capacityCheck.ok) {
    failures.push(
      `Not enough free worker slots for a full wave: ${capacityCheck.freeCount} free out of ${capacityCheck.cap} (FORGE_MAX_LIVE_WORKERS), need ${capacityCheck.waveSize}.`,
    )
  }

  if (infoLines.length > 0) {
    console.log(
      `Info — live/reclaimable /forge worktrees (not blocking dispatch):\n${infoLines.join('\n')}\n`,
    )
  }
  if (warnLines.length > 0) {
    console.log(
      `Warning — idle /forge worktrees (not blocking dispatch):\n${warnLines.join('\n')}\n`,
    )
  }

  if (failures.length > 0) {
    console.error('forge:preflight failed:\n')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
    return
  }

  const requiredFilesSummary =
    config.preflight.requiredFiles.length > 0
      ? `${config.preflight.requiredFiles.map((f) => f.path).join(', ')} present`
      : 'no required files configured'

  console.log(
    `forge:preflight OK — ${requiredFilesSummary}, no leftover worktree-agent-* branches, .claude/worktrees/ clean (or owned by a live/reclaimable /forge run), ${capacityCheck.freeCount}/${capacityCheck.cap} worker slots free.`,
  )
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `preflight` subcommand. See `claims.ts`'s `run()` for why this stages
 * `argv` onto `process.argv` rather than threading it through `main()`/
 * `mainPostDispatch()` directly. Unlike `claims.ts --list`, preflight has no
 * read-only carve-out — it's the dispatch gate itself, so a missing or
 * malformed `forge.config.json` is always fatal (exit 2) here.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv]
  try {
    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) {
      throw new ForgeConfigError('forge preflight: not inside a git repository')
    }
    const config = await requireForgeConfig(repoRoot)
    if (argv.includes('--post-dispatch')) {
      await mainPostDispatch(config)
    } else {
      await main(config, repoRoot)
    }
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
