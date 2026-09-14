import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

/**
 * Directory-based mutual-exclusion lock, shared by every `/forge` script
 * that needs one — extracted out of `e2e-queue.ts`, which had the only
 * production-proven implementation (its own top-of-file comment carries the
 * full "why a directory, not `flock`" rationale, stale-lock reclaim design,
 * and the `--git-common-dir` reasoning; this module keeps those exact
 * semantics rather than repeating the prose here).
 *
 * Generic over two things every caller picks for itself: the lock's
 * directory name (via {@link resolveLockDirectory}'s `lockName`, e.g.
 * `"e2e-queue.lock"`) and its holder payload shape (via the `THolder`
 * generic — every holder must carry {@link LockHolder}'s three fields, but a
 * caller can widen it with its own extra fields).
 *
 * `mkdirSync` — always without `{ recursive: true }`, which would silently
 * succeed against an already-existing directory and break the mutual
 * exclusion this whole module rests on — is the atomic primitive: of two
 * processes racing to create the same path, exactly one call wins and the
 * other throws `EEXIST`.
 */

export interface LockHolder {
  readonly pid: number
  readonly worktree: string
  readonly acquiredAt: number
}

/**
 * Resolves `<git-common-dir>/<lockName>`. `--git-common-dir`, not
 * `process.cwd()`, is deliberate: every `/forge` worktree shares one
 * `.git`, and a lock only serializes access if every worktree agrees on its
 * path — one scoped to a single worktree's own `.git` would let two
 * worktrees each "hold" an independent lock while stepping on the same
 * underlying resource anyway.
 */
export async function resolveLockDirectory(lockName: string): Promise<string> {
  const output =
    await Bun.$`git rev-parse --path-format=absolute --git-common-dir`.text()
  const gitCommonDirectory = output.trim()
  if (!gitCommonDirectory) {
    throw new Error(
      `forge-locks: could not resolve --git-common-dir for lock "${lockName}" — are we inside a git repo?`,
    )
  }
  // `--path-format=absolute` (git ≥2.31) is load-bearing, not cosmetic: a
  // bare `--git-common-dir` prints a path relative to `process.cwd()` (`.git`
  // at the repo root, `../.git` from a subdirectory) instead of relative to
  // the repo root itself. The global `forge` CLI is invoked from whatever
  // directory a worker's tool call happens to be in — often a worktree
  // subdirectory, never guaranteed to be the root — so joining a *relative*
  // git-common-dir onto an unrelated cwd would resolve `forge/slots` against
  // a different base per caller, silently splitting the dispatch mutex into
  // two disagreeing trees. Assert absoluteness rather than trust the flag
  // silently, since a future git without `--path-format` would otherwise
  // reintroduce this exact bug with no error at all.
  if (!path.isAbsolute(gitCommonDirectory)) {
    throw new Error(
      `forge-locks: --git-common-dir returned a non-absolute path ("${gitCommonDirectory}") for lock "${lockName}" — refusing to build a lock path that could resolve differently depending on cwd`,
    )
  }
  return path.join(gitCommonDirectory, lockName)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export function readLockHolder<THolder extends LockHolder = LockHolder>(
  lockDirectory: string,
): THolder | undefined {
  try {
    const raw = readFileSync(path.join(lockDirectory, 'holder.json'), 'utf8')
    return JSON.parse(raw) as THolder
  } catch {
    return undefined
  }
}

/**
 * A lock directory with no readable `holder.json` is treated as abandoned
 * (created by a process killed between `mkdirSync` and `writeFileSync`)
 * rather than trusted indefinitely. `maxAgeMs` alone must never reclaim a
 * lock whose pid is still alive — a legitimately slow holder can easily run
 * past its own max age, and reclaiming from under it would let a second
 * process start work against the same resource in parallel. The age check
 * only exists as a pid-reuse guard: it fires solely once the holder's own
 * `worktree` directory is gone too, something a still-running holder can
 * never observe about itself (it's the directory it's executing in) — so
 * that combination can only mean the original process died and its pid was
 * later recycled by an unrelated one.
 */
export function isLockStale(lockDirectory: string, maxAgeMs: number): boolean {
  const holder = readLockHolder(lockDirectory)
  if (!holder) return true
  if (!isProcessAlive(holder.pid)) return true
  return (
    Date.now() - holder.acquiredAt > maxAgeMs && !existsSync(holder.worktree)
  )
}

/**
 * One-shot, non-blocking acquire attempt: `true` if this call created
 * `lockDirectory` and wrote `holder` into it, `false` if another holder
 * already has it. Never polls or retries — {@link acquireLock} layers a
 * bounded wait on top of this for callers that need one; a short-lived
 * writer (a `bun` script that exits right after this call, with no
 * long-lived process left around to poll) can call this directly instead.
 */
export function didAcquireLock<THolder extends LockHolder>(
  lockDirectory: string,
  holder: THolder,
): boolean {
  try {
    mkdirSync(lockDirectory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
  writeFileSync(path.join(lockDirectory, 'holder.json'), JSON.stringify(holder))
  return true
}

export function releaseLock(lockDirectory: string): void {
  rmSync(lockDirectory, { recursive: true, force: true })
}

export interface AcquireLockOptions {
  /**
  Bounded wait, in ms, before {@link acquireLock} gives up and throws.
  */
  readonly timeoutMs: number
  /**
  Delay, in ms, between poll attempts.
  */
  readonly pollIntervalMs: number
  /**
  Passed through to {@link isLockStale} as its pid-reuse fallback.
  */
  readonly maxAgeMs: number
  /**
  Prefixes every message {@link acquireLock} logs or throws (e.g. `"e2e-queue"`).
  */
  readonly logLabel: string
}

/**
 * Bounded poll for the lock at `lockDirectory`, reclaiming it immediately —
 * without waiting out the rest of the poll budget — the moment
 * {@link isLockStale} reports its current holder is gone. `buildHolder` is
 * invoked fresh on every attempt rather than once up front, so a successful
 * acquire always records the real acquisition time rather than the time the
 * wait started. Throws once `options.timeoutMs` elapses with the lock still
 * held by a live holder.
 */
export async function acquireLock<THolder extends LockHolder>(
  lockDirectory: string,
  buildHolder: () => THolder,
  options: AcquireLockOptions,
): Promise<void> {
  const { timeoutMs, pollIntervalMs, maxAgeMs, logLabel } = options
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (didAcquireLock(lockDirectory, buildHolder())) return
    if (existsSync(lockDirectory) && isLockStale(lockDirectory, maxAgeMs)) {
      const holder = readLockHolder(lockDirectory)
      console.log(
        `${logLabel}: reclaiming a stale lock${holder ? ` (pid ${holder.pid} is no longer alive, or the lock is too old)` : ' (unreadable holder metadata)'}...`,
      )
      rmSync(lockDirectory, { recursive: true, force: true })
      continue
    }
    if (Date.now() >= deadline) {
      const holder = readLockHolder(lockDirectory)
      throw new Error(
        `${logLabel}: timed out after ${timeoutMs}ms waiting for the lock` +
          (holder ? ` (held by pid ${holder.pid} in ${holder.worktree})` : '') +
          ' — another process is mid-run. Re-run this command to retry.',
      )
    }
    await Bun.sleep(pollIntervalMs)
  }
}
