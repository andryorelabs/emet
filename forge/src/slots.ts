import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  requireForgeConfig,
  resolveRepoRoot,
  type ForgeConfig,
} from './config'
import {
  didAcquireLock,
  type LockHolder,
  readLockHolder,
  releaseLock,
  resolveLockDirectory,
} from './locks'
import { classifyRun, resolveSessionSlug, type RunVerdict } from './runs'

/**
 * Concurrency-cap slots under `<git-common-dir>/forge/slots/<index>` — the
 * missing half of `FORGE_MAX_LIVE_WORKERS` (see `docs/agents/forge.md`'s
 * "Concurrency" section). `forge:preflight`'s `checkSlotCapacity` has always
 * *counted* free slots, but nothing ever wrote one, so the cap was
 * aspirational — every slot always read as free no matter how many workers
 * were actually running.
 *
 * **Why this isn't built on `forge-locks.ts`'s own {@link isLockStale}.**
 * That function treats a holder as stale the instant its literal OS `pid`
 * exits — correct for a lock held by one continuously-running process for
 * its whole lifetime (`e2e-queue.ts`'s own lock). A dispatch slot instead
 * represents one worker's occupancy across an entire wave — hours, spanning
 * many separate short-lived tool-call processes, none of which is the thing
 * actually alive. The right liveness signal is the same one
 * `forge-claims.ts`'s reservations already use: `classifyRun`'s
 * `runId`/`anchorPid` anchor-process model. This module reuses
 * `forge-locks.ts`'s `mkdirSync`/EEXIST directory primitive — still the
 * right atomic acquire mechanism, since two coordinators racing for the same
 * slot index still need exactly one to win — but replaces its
 * pid-liveness-based staleness check with one built on `classifyRun`
 * instead.
 *
 * **Call this through `forge slots`, never through an inline `bun
 * -e` snippet** — same rationale as `forge-claims.ts`'s file-level doc
 * comment (AO-285): an untypechecked positional call is how that incident's
 * reservation got corrupted, and a slot holder has the same
 * `runId`/`anchorPid`/`ticket` shape.
 */

export interface SlotHolder extends LockHolder {
  readonly runId: string
  readonly anchorPid: number
  readonly ticket: string
  readonly sessionSlug: string
}

export async function resolveSlotsDirectory(): Promise<string> {
  const forgeDirectory = await resolveLockDirectory('forge')
  const slotsDirectory = path.join(forgeDirectory, 'slots')
  /**
   * Recursive on purpose, unlike {@link didAcquireLock}'s own `mkdirSync`:
   * this creates the shared *container* (`forge/slots/`), never the atomic
   * per-index lock itself (`forge/slots/<index>/`), so there is no mutual
   * exclusion to break here — only whether the parent exists at all before
   * the first `acquireSlot` call ever made against a given `.git` (a fresh
   * clone, or the first `/forge` run to use slots after AO-256's `forge:claims`
   * already created its own sibling `forge/tickets/` directory).
   */
  mkdirSync(slotsDirectory, { recursive: true })
  return slotsDirectory
}

function slotDirectory(slotsDirectory: string, index: number): string {
  return path.join(slotsDirectory, String(index))
}

/**
 * `'idle'` is deliberately treated the same as `'live'` here — the same
 * ambiguity `shouldWriteReservation` (`forge-claims.ts`) refuses to
 * auto-reclaim: a restart mid-run looks identical to a genuinely gone
 * process from the outside, so a slot only frees up once its owner
 * classifies unambiguously `'dead'`.
 */
export function isSlotStale(
  slotsDirectory: string,
  index: number,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): boolean {
  const holder = readLockHolder<SlotHolder>(
    slotDirectory(slotsDirectory, index),
  )
  if (!holder) return true
  return (
    classifyRun(
      holder.anchorPid,
      holder.sessionSlug,
      holder.runId,
      classifyRunOptions,
    ) === 'dead'
  )
}

function buildSlotHolder(
  runId: string,
  anchorPid: number,
  ticket: string,
): SlotHolder {
  return {
    pid: process.pid,
    worktree: process.cwd(),
    acquiredAt: Date.now(),
    runId,
    anchorPid,
    ticket,
    sessionSlug: resolveSessionSlug(),
  }
}

function didAcquireSlotIndex(
  slotsDirectory: string,
  index: number,
  holder: SlotHolder,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): boolean {
  const directory = slotDirectory(slotsDirectory, index)
  if (didAcquireLock(directory, holder)) return true
  if (isSlotStale(slotsDirectory, index, classifyRunOptions)) {
    releaseLock(directory)
    return didAcquireLock(directory, holder)
  }
  return false
}

/**
 * Claims the first free (or reclaimably-`'dead'`) slot in `[0, cap)` for
 * `runId`/`anchorPid`/`ticket`, returning the index it took or `null` if
 * every slot is genuinely occupied by a `'live'` or `'idle'` owner. One
 * worker, one slot, one call — a coordinator dispatching a wave of N workers
 * calls this N times, once immediately before each worker's `Agent` call
 * (mirroring `didReserveTicket`'s own "reserve immediately before dispatch"
 * placement).
 */
export async function acquireSlot(
  cap: number,
  runId: string,
  anchorPid: number,
  ticket: string,
  slotsDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): Promise<number | null> {
  const resolvedSlotsDirectory =
    slotsDirectory ?? (await resolveSlotsDirectory())
  const holder = buildSlotHolder(runId, anchorPid, ticket)
  for (let index = 0; index < cap; index++) {
    if (
      didAcquireSlotIndex(
        resolvedSlotsDirectory,
        index,
        holder,
        classifyRunOptions,
      )
    ) {
      return index
    }
  }
  return null
}

export function releaseSlot(slotsDirectory: string, index: number): void {
  releaseLock(slotDirectory(slotsDirectory, index))
}

/**
 * Releases every slot `runId` currently holds — used by
 * `forge cleanup --run <runId>` at wave close-out, so a coordinator
 * never has to remember which indices it took across N {@link acquireSlot}
 * calls, and by `forge:slots --release --run <runId>` for the same purpose
 * when a dispatch aborts before reaching cleanup.
 */
export async function releaseAllSlotsForRun(
  runId: string,
  slotsDirectory?: string,
): Promise<number[]> {
  const resolvedSlotsDirectory =
    slotsDirectory ?? (await resolveSlotsDirectory())
  if (!existsSync(resolvedSlotsDirectory)) return []

  const released: number[] = []
  for (const name of readdirSync(resolvedSlotsDirectory)) {
    const index = Number(name)
    if (!Number.isSafeInteger(index)) continue
    const holder = readLockHolder<SlotHolder>(
      slotDirectory(resolvedSlotsDirectory, index),
    )
    if (holder?.runId === runId) {
      releaseSlot(resolvedSlotsDirectory, index)
      released.push(index)
    }
  }
  return released
}

export type SlotListEntry = {
  readonly index: number
  readonly holder: SlotHolder
  readonly verdict: RunVerdict
}

export async function listOccupiedSlots(
  slotsDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): Promise<SlotListEntry[]> {
  const resolvedSlotsDirectory =
    slotsDirectory ?? (await resolveSlotsDirectory())
  if (!existsSync(resolvedSlotsDirectory)) return []

  const entries: SlotListEntry[] = []
  for (const name of readdirSync(resolvedSlotsDirectory)) {
    const index = Number(name)
    if (!Number.isSafeInteger(index)) continue
    const holder = readLockHolder<SlotHolder>(
      slotDirectory(resolvedSlotsDirectory, index),
    )
    if (!holder) continue
    entries.push({
      index,
      holder,
      verdict: classifyRun(
        holder.anchorPid,
        holder.sessionSlug,
        holder.runId,
        classifyRunOptions,
      ),
    })
  }
  return entries.toSorted((a, b) => a.index - b.index)
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag)
  if (index === -1) return null
  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function requireFlagValue(argv: readonly string[], flag: string): string {
  const value = readFlagValue(argv, flag)
  if (!value) {
    throw new Error(`forge:slots — ${flag} requires a value`)
  }
  return value
}

function readPositiveIntEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * `FORGE_MAX_LIVE_WORKERS` still overrides `forge.config.json`'s
 * `concurrency.maxLiveWorkers` when set — same precedence `preflight.ts`
 * honors, kept so the existing escape hatch never breaks.
 */
function resolveMaxLiveWorkers(config: ForgeConfig): number {
  return readPositiveIntEnvironment(
    'FORGE_MAX_LIVE_WORKERS',
    config.concurrency.maxLiveWorkers,
  )
}

/**
 * CLI entry point — the only supported calling convention (see the
 * file-level doc comment for why an inline `bun -e` snippet is not).
 *
 * ```
 * forge slots --acquire --run <runId> --anchor <pid> --ticket <ticket>
 * forge slots --release --run <runId>
 * forge slots --release-index <index>
 * forge slots --list
 * ```
 */
async function main(config: ForgeConfig): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.includes('--acquire')) {
    const runId = requireFlagValue(argv, '--run')
    const anchorPid = Number(requireFlagValue(argv, '--anchor'))
    const ticket = requireFlagValue(argv, '--ticket')
    const maxLiveWorkers = resolveMaxLiveWorkers(config)
    const index = await acquireSlot(maxLiveWorkers, runId, anchorPid, ticket)
    if (index === null) {
      console.error(
        `forge:slots — no free slot (all ${maxLiveWorkers} occupied by a live or idle run).`,
      )
      process.exitCode = 1
      return
    }
    console.log(`forge:slots — acquired slot ${index} for ${ticket}.`)
    return
  }

  if (argv.includes('--release')) {
    const runId = requireFlagValue(argv, '--run')
    const released = await releaseAllSlotsForRun(runId)
    console.log(
      `forge:slots — released ${released.length} slot(s) for run ${runId}${released.length > 0 ? `: ${released.join(', ')}` : ''}.`,
    )
    return
  }

  if (argv.includes('--release-index')) {
    const index = Number(requireFlagValue(argv, '--release-index'))
    const slotsDirectory = await resolveSlotsDirectory()
    releaseSlot(slotsDirectory, index)
    console.log(`forge:slots — released slot ${index}.`)
    return
  }

  if (argv.includes('--list')) {
    const entries = await listOccupiedSlots()
    if (entries.length === 0) {
      console.log('forge:slots — no slots occupied.')
      return
    }
    for (const { index, holder, verdict } of entries) {
      console.log(
        `${index}  run=${holder.runId}  anchor=${holder.anchorPid}  ticket=${holder.ticket}  ${verdict}  since=${new Date(holder.acquiredAt).toISOString()}`,
      )
    }
    return
  }

  console.error(
    'usage: forge slots --acquire --run <runId> --anchor <pid> --ticket <ticket> | --release --run <runId> | --release-index <index> | --list',
  )
  process.exitCode = 1
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `slots` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly, and
 * for why `--list` alone tolerates a missing `forge.config.json` (falls back
 * to {@link DEFAULT_FORGE_CONFIG}) while every mutating mode
 * (`--acquire`/`--release`/`--release-index`) requires a real one.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv]
  try {
    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) {
      throw new ForgeConfigError('forge slots: not inside a git repository')
    }
    const config = argv.includes('--list')
      ? (await loadForgeConfigWithDefaults(repoRoot)).config
      : await requireForgeConfig(repoRoot)
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
