import { readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Classifies whether a `/forge` run (coordinator or worker) is still alive
 * — see AO-256. The pid a claim/reservation was written from is a
 * short-lived `bun` process, so `process.kill(pid, 0)` (the right pattern
 * for a lock whose holder *is* the process that took it) is meaningless
 * here: by the time anything reads the pid back, that `bun` process has
 * already exited. Liveness instead has to
 * be read off the run's *anchor* — the actual Claude Code process that
 * spawned every short-lived tool-call process the run will ever make — via
 * `/proc`, with a soft, best-effort transcript-freshness fallback for the
 * ambiguous case where the anchor is gone but the run may just be between
 * tool calls.
 *
 * This module only classifies; it never deletes or reclaims anything
 * itself — that decision (and any `--force` gating around it) belongs to
 * the caller.
 */

export type RunVerdict = 'live' | 'idle' | 'dead'

function readPositiveIntEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const RUN_IDLE_THRESHOLD_MS = readPositiveIntEnvironment(
  'FORGE_RUN_IDLE_THRESHOLD_MS',
  90 * 60_000,
)

/**
 * `FORGE_RUN_IDLE_THRESHOLD_MS` still overrides `forge.config.json`'s
 * `concurrency.runIdleThresholdMs` when set — same precedence
 * `preflight.ts`'s `FORGE_MAX_LIVE_WORKERS` honors, kept so the existing
 * escape hatch never breaks. Callers pass the result as `classifyRun`'s
 * `idleThresholdMs` option; `classifyRun` itself stays config-unaware so its
 * own tests keep exercising the pure default.
 */
export function resolveIdleThresholdMs(config: {
  readonly concurrency: { readonly runIdleThresholdMs: number }
}): number {
  return readPositiveIntEnvironment(
    'FORGE_RUN_IDLE_THRESHOLD_MS',
    config.concurrency.runIdleThresholdMs,
  )
}

function readProcStatusField(pid: number, field: string): string | undefined {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    const line = status
      .split('\n')
      .find((candidate) => candidate.startsWith(`${field}:`))
    return line?.slice(field.length + 1).trim()
  } catch {
    return undefined
  }
}

function readProcComm(pid: number): string | undefined {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
  } catch {
    return undefined
  }
}

/**
 * Walks `PPid` upward from `startPid` (a tool-call process, e.g. this
 * script's own `bun`) until it finds an ancestor whose `/proc/<pid>/comm`
 * reads `claude` — the Claude Code process itself, which outlives every
 * short-lived process it spawns for the life of the run. Two hops from a
 * Bash-tool-spawned process (bun → the shell → claude) is the common case;
 * the walk is bounded to guard against a `/proc` read racing a process
 * exiting mid-walk and producing a cycle or a dead end.
 */
export function resolveAnchorPid(startPid: number = process.pid): number {
  let pid = startPid
  for (let hop = 0; hop < 32; hop++) {
    if (readProcComm(pid) === 'claude') return pid
    const ppidRaw = readProcStatusField(pid, 'PPid')
    const ppid = ppidRaw === undefined ? NaN : Number(ppidRaw)
    if (!Number.isFinite(ppid) || ppid <= 1) break
    pid = ppid
  }
  throw new Error(
    `forge-runs: no ancestor of pid ${startPid} has comm "claude" within 32 hops`,
  )
}

/**
 * Field 22 (`starttime`, clock ticks since boot) of `/proc/<pid>/stat`: it
 * never changes for a process's lifetime and differs for a later process
 * that reuses the same pid. `comm` may contain spaces and parentheses, so
 * fields are counted from after the last `)`.
 */
export function readProcessStartToken(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fieldsAfterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return fieldsAfterComm[19] || undefined
  } catch {
    return undefined
  }
}

/**
 * A bare `/proc/<pid>` existence check is not enough — pids get reused, so
 * an exited anchor whose pid the OS has handed to something else would read
 * as alive. Requiring `comm` to still read `claude` closes that gap: a
 * recycled pid now running an unrelated process reads as dead.
 * `readProcComm` already returns `undefined` for a missing `/proc/<pid>`
 * (caught internally), so no separate `existsSync` pre-check is needed.
 */
export function isAnchorAlive(pid: number, startToken?: string): boolean {
  if (readProcComm(pid) !== 'claude') return false
  if (startToken === undefined) return true
  return readProcessStartToken(pid) === startToken
}

/**
 * Derives the `~/.claude/projects/<slug>` directory name Claude Code itself
 * uses for a working directory — every path separator replaced with `-`
 * (observable directly in this repo's own scratchpad path, which is nested
 * under exactly this slug for the main checkout). Every reservation in this
 * registry belongs to the same project, so this only ever needs the current
 * process's own `cwd`, never a value stored per-reservation.
 */
export function resolveSessionSlug(cwd: string = process.cwd()): string {
  return cwd.replaceAll('/', '-')
}

/**
 * Best-effort `mtime` of a run's own transcript file. Returns `null` on any
 * read failure (missing file, unreadable `$HOME`, permissions) rather than
 * throwing — this is a soft freshness signal layered on top of
 * {@link isAnchorAlive}, never the primary liveness check, so a transcript
 * read failing must never itself be mistaken for "the run is dead".
 */
export function transcriptMtime(
  sessionSlug: string,
  runId: string,
): number | null {
  try {
    const transcriptPath = path.join(
      os.homedir(),
      '.claude',
      'projects',
      sessionSlug,
      `${runId}.jsonl`,
    )
    return statSync(transcriptPath).mtimeMs
  } catch {
    return null
  }
}

/**
 * `'live'`: the anchor process is still running — the strong, primary
 * signal. `'idle'`: the anchor is gone but the run's transcript was
 * touched within `idleThresholdMs` (default `FORGE_RUN_IDLE_THRESHOLD_MS`,
 * 90 minutes) — ambiguous (a restart mid-run looks identical to this from
 * the outside), so callers must report it, never auto-act on it. `'dead'`:
 * neither signal holds — reclaimable, but still only under whatever
 * explicit confirmation the caller requires; this function itself never
 * deletes or reclaims anything.
 *
 * `isAnchorAliveFn`/`transcriptMtimeFn` are injectable so tests can exercise
 * all three verdicts without depending on real `/proc` state or a real
 * transcript file, the same pure-function-over-injected-data shape
 * `worktrees.ts` already uses for `git worktree list --porcelain`.
 */
export function classifyRun(
  anchorPid: number,
  sessionSlug: string,
  runId: string,
  options: {
    readonly now?: number
    readonly idleThresholdMs?: number
    readonly anchorStartToken?: string
    readonly isAnchorAliveFn?: (pid: number, startToken?: string) => boolean
    readonly transcriptMtimeFn?: (
      sessionSlug: string,
      runId: string,
    ) => number | null
  } = {},
): RunVerdict {
  const {
    now = Date.now(),
    anchorStartToken,
    idleThresholdMs = RUN_IDLE_THRESHOLD_MS,
    isAnchorAliveFn: isAnchorAliveFunction = isAnchorAlive,
    transcriptMtimeFn: transcriptMtimeFunction = transcriptMtime,
  } = options

  if (isAnchorAliveFunction(anchorPid, anchorStartToken)) return 'live'

  const mtime = transcriptMtimeFunction(sessionSlug, runId)
  if (mtime !== null && now - mtime <= idleThresholdMs) return 'idle'

  return 'dead'
}
