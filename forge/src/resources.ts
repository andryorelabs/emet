import { readFileSync } from 'node:fs'
import os from 'node:os'

/**
 * Host facts `concurrency.maxLiveWorkers: "auto"` (`config.ts`) derives its
 * cap from, and the memory brake `slots.ts`'s `acquireSlot` checks before
 * ever scanning a slot index. Everything here is a pure read of already-
 * gathered data — {@link readHostResources} is the only impure entry point,
 * kept separate so {@link computeAutoMaxLiveWorkers} and
 * {@link checkMemoryHeadroom} are testable with fabricated `HostResources`
 * and never touch `/proc` or `os.*` in a test.
 *
 * **Why this exists at all** — `concurrency.maxLiveWorkers: 8` was `2 ×
 * waveSize`, chosen once (AO-259) with no relationship to any host's actual
 * capacity, then carried forward verbatim into every repo `forge init`
 * writes. On a 16-vCPU/62GiB host running several Orca worktrees, that cap
 * bites long before the machine's own resources do (see
 * `reference/incidents.md`, "The 8-slot ceiling on a 16-core host").
 */

export interface HostResources {
  readonly cpuCount: number
  readonly memTotalBytes: number
  /** `null` on a host with no readable `/proc/meminfo` (non-Linux) — callers
   * degrade rather than fail: {@link computeAutoMaxLiveWorkers} falls back to
   * `memTotalBytes` alone, {@link checkMemoryHeadroom} always passes. */
  readonly memAvailableBytes: number | null
}

function readProcMeminfoField(content: string, field: string): number | null {
  const match = new RegExp(`^${field}:\\s+(\\d+)\\s*kB`, 'm').exec(content)
  if (!match) return null
  const kib = Number(match[1])
  return Number.isFinite(kib) ? kib * 1024 : null
}

/**
 * Cgroup v2 read for a repo-global CLI that may run inside a container with
 * a stricter budget than the host it's on — `cpu.max`'s first field is
 * `"max"` (unlimited) or a quota in microseconds over the second field's
 * period; `memory.max` is `"max"` or a byte count. Both return `null` (never
 * `0` or `Infinity`) when absent, unreadable, or unlimited, so callers can
 * `Math.min` them in with a plain `??`/ignore rather than special-casing
 * "no limit".
 */
function readCgroupCpuLimit(): number | null {
  try {
    const raw = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim()
    const [quotaRaw, periodRaw] = raw.split(/\s+/)
    if (quotaRaw === 'max' || !quotaRaw || !periodRaw) return null
    const quota = Number(quotaRaw)
    const period = Number(periodRaw)
    if (!Number.isFinite(quota) || !Number.isFinite(period) || period <= 0) return null
    return quota / period
  } catch {
    return null
  }
}

function readCgroupMemoryLimit(): number | null {
  try {
    const raw = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim()
    if (raw === 'max') return null
    const bytes = Number(raw)
    return Number.isFinite(bytes) ? bytes : null
  } catch {
    return null
  }
}

/**
 * Reads cpu count, total RAM, and available RAM off the real host —
 * `os.availableParallelism()`/`os.totalmem()` first, then narrowed by a
 * cgroup v2 limit when one applies (the CLI is installed globally and may
 * run inside a container stricter than the host), then `MemAvailable` from
 * `/proc/meminfo` (the kernel's own "can be allocated without swapping"
 * estimate — more accurate than `free - used`, which ignores reclaimable
 * cache). Never throws: a host with no `/proc/meminfo` (non-Linux) reports
 * `memAvailableBytes: null` rather than failing the caller.
 */
export function readHostResources(): HostResources {
  const cgroupCpuLimit = readCgroupCpuLimit()
  const cpuCount = Math.max(
    1,
    Math.floor(
      cgroupCpuLimit !== null
        ? Math.min(os.availableParallelism(), cgroupCpuLimit)
        : os.availableParallelism(),
    ),
  )

  const cgroupMemoryLimit = readCgroupMemoryLimit()
  const memTotalBytes =
    cgroupMemoryLimit !== null ? Math.min(os.totalmem(), cgroupMemoryLimit) : os.totalmem()

  let memAvailableBytes: number | null = null
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8')
    memAvailableBytes = readProcMeminfoField(meminfo, 'MemAvailable')
  } catch {
    memAvailableBytes = null
  }
  if (memAvailableBytes !== null && cgroupMemoryLimit !== null) {
    memAvailableBytes = Math.min(memAvailableBytes, cgroupMemoryLimit)
  }

  return { cpuCount, memTotalBytes, memAvailableBytes }
}

const BYTES_PER_GIB = 1024 ** 3

export interface AutoCapOptions {
  /** Worker slots per cpu core. Default 1 — a worker's own steady-state load
   * (tsc/eslint/test runs inside its worktree) is cpu-bound enough that
   * oversubscribing cores buys throughput on paper but not in practice once
   * every worker is compiling at once. */
  readonly cpuOversubscribe?: number
  /** RAM held back for the coordinator itself, the OS, and everything else
   * already running on the host (docker, an IDE, other sessions) — never
   * handed to the worker-count formula. Default 8 GiB. */
  readonly memReserveBytes?: number
  /** RAM budgeted per worker (its own worktree's build/test/dev-server
   * footprint). Default 2 GiB — conservative for a `bun`/`tsc`/`eslint`
   * worker; a repo running a heavier per-worker stack (e.g. a browser-driven
   * E2E suite per worktree) should raise this via
   * `FORGE_MEM_PER_WORKER_GIB`. */
  readonly memPerWorkerBytes?: number
  /** Absolute floor — never auto-compute below this, even on a tiny host,
   * so a wave of `waveSize` (default 4) can still always attempt to
   * dispatch. Default 2. */
  readonly min?: number
  /** Absolute ceiling — ports, a shared docker Postgres/greenmail instance,
   * and API rate limits don't scale with cores or RAM, so an auto-computed
   * cap never exceeds this regardless of how large the host is. Default
   * 32. */
  readonly max?: number
}

const DEFAULT_AUTO_CAP_OPTIONS: Required<AutoCapOptions> = {
  cpuOversubscribe: 1,
  memReserveBytes: 8 * BYTES_PER_GIB,
  memPerWorkerBytes: 2 * BYTES_PER_GIB,
  min: 2,
  max: 32,
}

/**
 * `concurrency.maxLiveWorkers: "auto"`'s formula:
 * `clamp(min(cpuCount × cpuOversubscribe, floor((memTotal − memReserve) / memPerWorker)), min, max)`.
 *
 * Deliberately built from **static** facts (cpu count, total RAM) rather
 * than momentary `MemAvailable` — the cap is meant to be a stable number a
 * human can reason about (`forge doctor` prints it once, unsurprising run to
 * run), not one that silently shrinks because another program happened to be
 * using RAM at the instant `forge init`/`forge doctor` ran. Momentary
 * pressure is {@link checkMemoryHeadroom}'s job, checked fresh on every
 * `acquireSlot` call instead.
 */
export function computeAutoMaxLiveWorkers(
  resources: HostResources,
  options: AutoCapOptions = {},
): number {
  const { cpuOversubscribe, memReserveBytes, memPerWorkerBytes, min, max } = {
    ...DEFAULT_AUTO_CAP_OPTIONS,
    ...options,
  }
  const cpuBound = resources.cpuCount * cpuOversubscribe
  const memoryBound = Math.floor(
    Math.max(0, resources.memTotalBytes - memReserveBytes) / memPerWorkerBytes,
  )
  const raw = Math.min(cpuBound, memoryBound)
  return Math.min(max, Math.max(min, raw))
}

export type HeadroomVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: string
      readonly memAvailableBytes: number
      readonly reserveBytes: number
    }

/**
 * The admission brake `acquireSlot` checks before ever scanning a slot index
 * — with no swap configured (the common case for this CLI's own host, and
 * generally true of any VPS), exhausting RAM is an OOM kill, not a slowdown,
 * so this is the one signal that gates dispatch outright rather than merely
 * degrading it. CPU pressure never blocks here: a saturated host makes every
 * worker slower, never wrong, so there is nothing for an admission check to
 * protect against.
 *
 * Passes vacuously (`ok: true`) when `memAvailableBytes` is `null` (a host
 * with no `/proc/meminfo`) — a brake with no signal to read is not a brake
 * that should fail closed; it degrades to "not enforced" rather than
 * "always deny".
 */
export function checkMemoryHeadroom(
  resources: HostResources,
  reserveBytes: number,
): HeadroomVerdict {
  if (resources.memAvailableBytes === null) return { ok: true }
  if (resources.memAvailableBytes >= reserveBytes) return { ok: true }
  return {
    ok: false,
    reason: `only ${(resources.memAvailableBytes / BYTES_PER_GIB).toFixed(1)} GiB available, below the ${(reserveBytes / BYTES_PER_GIB).toFixed(1)} GiB reserve`,
    memAvailableBytes: resources.memAvailableBytes,
    reserveBytes,
  }
}

function readPositiveFloatEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * `AutoCapOptions` sourced from `FORGE_CPU_OVERSUBSCRIBE`,
 * `FORGE_MEM_RESERVE_GIB`, `FORGE_MEM_PER_WORKER_GIB` — all optional, same
 * "escape hatch env var overrides a config/default value" precedence every
 * other `FORGE_*` variable in this CLI already has.
 */
export function resolveAutoCapOptionsFromEnvironment(): AutoCapOptions {
  return {
    cpuOversubscribe: readPositiveFloatEnvironment(
      'FORGE_CPU_OVERSUBSCRIBE',
      DEFAULT_AUTO_CAP_OPTIONS.cpuOversubscribe,
    ),
    memReserveBytes:
      readPositiveFloatEnvironment(
        'FORGE_MEM_RESERVE_GIB',
        DEFAULT_AUTO_CAP_OPTIONS.memReserveBytes / BYTES_PER_GIB,
      ) * BYTES_PER_GIB,
    memPerWorkerBytes:
      readPositiveFloatEnvironment(
        'FORGE_MEM_PER_WORKER_GIB',
        DEFAULT_AUTO_CAP_OPTIONS.memPerWorkerBytes / BYTES_PER_GIB,
      ) * BYTES_PER_GIB,
  }
}

/** `FORGE_MEM_RESERVE_GIB` alone, as bytes — the single value
 * {@link checkMemoryHeadroom} needs, kept separate from
 * {@link resolveAutoCapOptionsFromEnvironment} so `slots.ts` doesn't have to
 * reach into an options bag for one field. */
export function resolveMemReserveBytesFromEnvironment(): number {
  return (
    readPositiveFloatEnvironment(
      'FORGE_MEM_RESERVE_GIB',
      DEFAULT_AUTO_CAP_OPTIONS.memReserveBytes / BYTES_PER_GIB,
    ) * BYTES_PER_GIB
  )
}
