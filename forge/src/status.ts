/**
 * `forge status [--spec <id>]` — one answer to "where is my wave?".
 *
 * Merges runs (slot holders), claims (ticket reservations), worktrees (locked
 * by `forge lock-reason`) and the PR of each worker branch into one state per
 * wave: `working | checking | ready | needs-decision`. A host with no wave at
 * all reports `idle`. Prints a JSON report, then a one-line human summary.
 *
 * Stalled workers (the `usage` stalled signal) force `needs-decision`.
 */

import { optionalProperty } from './optional'
import os from 'node:os'
import path from 'node:path'

import { DEFAULT_FORGE_CONFIG, resolveRepoRoot } from './config'
import { listReservations } from './claims'
import { classifyRun, type RunVerdict } from './runs'
import { listOccupiedSlots } from './slots'
import { findStalledTranscripts } from './usage'
import {
  listWorktreeEntries,
  resolveWorktreeOwner,
  type WorktreeEntry,
} from './worktrees'

export type WaveState = 'working' | 'checking' | 'ready' | 'needs-decision'
export type OverallState = WaveState | 'idle'
export type ChecksState = 'passing' | 'failing' | 'pending' | 'none'
export type PullRequestStatus = {
  readonly number: number
  readonly state: 'open' | 'merged' | 'closed'
  readonly checks: ChecksState
  readonly mergeable: boolean | null
  readonly changesRequested: boolean
}

export type WorkerSignal = {
  readonly ticket: string
  readonly branch: string | null
  readonly pullRequest: PullRequestStatus | null
  readonly stalled: boolean
}

export type WaveInput = {
  readonly runId: string
  readonly runVerdict: RunVerdict
  readonly workers: readonly WorkerSignal[]
}

export type WorkerReport = WorkerSignal & {
  readonly state: WaveState
  readonly reason: string
}

export type WaveReport = {
  readonly runId: string
  readonly spec: string | null
  readonly wave: number | null
  readonly runVerdict: RunVerdict
  readonly state: WaveState
  readonly workers: readonly WorkerReport[]
}

export type StatusReport = {
  readonly state: OverallState
  readonly spec: string | null
  readonly waves: readonly WaveReport[]
}

export const STATUS_USAGE = `usage: forge status [--spec <id>]

Prints one JSON object, then a one-line summary.

JSON shape:
  {
    "state": "idle" | "working" | "checking" | "ready" | "needs-decision",
    "spec": "<id>" | null,
    "waves": [{
      "runId": string, "spec": string | null, "wave": number | null,
      "runVerdict": "live" | "idle" | "dead",
      "state": "working" | "checking" | "ready" | "needs-decision",
      "workers": [{
        "ticket": string, "branch": string | null,
        "pullRequest": null | { "number", "state": "open"|"merged"|"closed",
          "checks": "passing"|"failing"|"pending"|"none",
          "mergeable": boolean | null, "changesRequested": boolean },
        "stalled": boolean, "state": <wave state>, "reason": string
      }]
    }]
  }

Overall state is the most urgent wave state: needs-decision > ready >
checking > working. No active run reports "idle". Run ids shaped
forge<spec>w<wave><HHMMSS> carry their spec and wave for --spec filtering.`

const STATE_PRIORITY: readonly WaveState[] = [
  'needs-decision',
  'ready',
  'checking',
  'working',
]

export function parseRunIdentity(runId: string): {
  spec: string | null
  wave: number | null
} {
  const match = /^forge(\d+)w(\d+?)(\d{6})$/.exec(runId)
  if (!match) return { spec: null, wave: null }
  return { spec: match[1]!, wave: Number(match[2]) }
}

export function classifyWorker(
  worker: WorkerSignal,
  runVerdict: RunVerdict,
): { state: WaveState; reason: string } {
  const pullRequest = worker.pullRequest
  if (worker.stalled) return { state: 'needs-decision', reason: 'worker stalled' }
  if (pullRequest) {
    if (pullRequest.state === 'merged') return { state: 'ready', reason: 'merged' }
    if (pullRequest.state === 'closed') {
      return { state: 'needs-decision', reason: 'PR closed without merging' }
    }
    if (pullRequest.changesRequested) {
      return { state: 'needs-decision', reason: 'changes requested' }
    }
    if (pullRequest.checks === 'failing') {
      return { state: 'needs-decision', reason: 'checks failing' }
    }
    if (pullRequest.mergeable === false) {
      return { state: 'needs-decision', reason: 'merge conflict' }
    }
    if (pullRequest.checks === 'pending') {
      return { state: 'checking', reason: 'checks running' }
    }
    return { state: 'ready', reason: 'PR green and mergeable' }
  }
  if (runVerdict === 'dead') {
    return { state: 'needs-decision', reason: 'run is dead and no PR exists' }
  }
  return { state: 'working', reason: 'no PR yet' }
}

export function classifyWave(wave: WaveInput): WaveReport {
  const workers: WorkerReport[] = wave.workers.map((worker) => ({
    ...worker,
    ...classifyWorker(worker, wave.runVerdict),
  }))
  const states = new Set(workers.map((worker) => worker.state))
  let state: WaveState = 'working'
  if (states.has('needs-decision')) state = 'needs-decision'
  else if (workers.length > 0 && workers.every((worker) => worker.state === 'ready')) {
    state = 'ready'
  } else if (states.has('working')) state = 'working'
  else if (states.has('checking')) state = 'checking'
  return {
    runId: wave.runId,
    ...parseRunIdentity(wave.runId),
    runVerdict: wave.runVerdict,
    state,
    workers,
  }
}

export function buildStatusReport(
  waves: readonly WaveInput[],
  spec: string | null,
): StatusReport {
  const reports = waves
    .map(classifyWave)
    .filter((report) => spec === null || report.spec === spec)
    .toSorted((a, b) => a.runId.localeCompare(b.runId))
  const state: OverallState =
    STATE_PRIORITY.find((candidate) =>
      reports.some((report) => report.state === candidate),
    ) ?? 'idle'
  return { state, spec, waves: reports }
}

export function summarize(report: StatusReport): string {
  if (report.waves.length === 0) {
    return `forge status: idle — no active wave${report.spec ? ` for spec ${report.spec}` : ''}`
  }
  const parts = report.waves.map((wave) => {
    const label = wave.wave === null ? wave.runId : `wave ${wave.wave}`
    const reasons = [
      ...new Set(
        wave.workers.filter((w) => w.state === wave.state).map((w) => w.reason),
      ),
    ]
    return `${label} ${wave.state} (${wave.workers.length} worker(s)${reasons.length ? `: ${reasons.join(', ')}` : ''})`
  })
  return `forge status: ${report.state} — ${parts.join('; ')}`
}

type RawPullRequest = {
  number: number
  state: string
  headRefName: string
  body?: string | null
  mergeable?: string
  reviewDecision?: string | null
  statusCheckRollup?:
    | { conclusion?: string | null; status?: string; state?: string }[]
    | null
}

const FAILED_CONCLUSIONS = [
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'CANCELLED',
  'STARTUP_FAILURE',
]

export function parsePullRequests(json: string): Map<string, PullRequestStatus> {
  const result = new Map<string, PullRequestStatus>()
  for (const item of JSON.parse(json) as RawPullRequest[]) {
    const checks = item.statusCheckRollup ?? []
    const failed = checks.some((c) =>
      FAILED_CONCLUSIONS.includes(c.conclusion ?? c.state ?? ''),
    )
    const pending = checks.some((c) =>
      c.status !== undefined
        ? c.status !== 'COMPLETED'
        : c.state === 'PENDING' || c.state === 'EXPECTED',
    )
    const checksState: ChecksState =
      checks.length === 0 ? 'none' : failed ? 'failing' : pending ? 'pending' : 'passing'
    const status: PullRequestStatus = {
      number: item.number,
      state:
        item.state === 'MERGED' ? 'merged' : item.state === 'CLOSED' ? 'closed' : 'open',
      checks: checksState,
      mergeable:
        item.mergeable === 'CONFLICTING' ? false : item.mergeable === 'MERGEABLE' ? true : null,
      changesRequested: item.reviewDecision === 'CHANGES_REQUESTED',
    }
    result.set(item.headRefName, status)
    for (const issueNumber of closingIssueNumbers(item.body ?? '')) {
      const key = `#${issueNumber}`
      if (!result.has(key)) result.set(key, status)
    }
  }
  return result
}

/**
 * A wave opens one PR from its integration branch, never from a worker branch,
 * and closes its tickets with `Closes #N, #M`. Those issue numbers are the only
 * link between a worker and its wave's PR, so they are indexed as `#<n>` keys.
 */
export function closingIssueNumbers(body: string): string[] {
  const numbers: string[] = []
  for (const line of body.split('\n')) {
    const match = /^\s*(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(.*)$/i.exec(line)
    if (!match) continue
    for (const reference of match[1]!.matchAll(/#(\d+)/g)) numbers.push(reference[1]!)
  }
  return numbers
}

function findPullRequest(
  pullRequests: ReadonlyMap<string, PullRequestStatus>,
  branch: string | null,
  ticket: string,
): PullRequestStatus | null {
  const byBranch = branch ? pullRequests.get(branch) : undefined
  if (byBranch) return byBranch
  const issueNumber = /(\d+)$/.exec(ticket)?.[1]
  return issueNumber ? (pullRequests.get(`#${issueNumber}`) ?? null) : null
}

export function groupWorkers(
  entries: readonly WorktreeEntry[],
  reservations: readonly { runId: string; ticket: string }[],
  pullRequests: ReadonlyMap<string, PullRequestStatus>,
  stalledDirectories: ReadonlySet<string>,
  runVerdicts: ReadonlyMap<string, RunVerdict>,
): WaveInput[] {
  const byRun = new Map<string, Map<string, WorkerSignal>>()
  const add = (runId: string, signal: WorkerSignal) => {
    const tickets = byRun.get(runId) ?? new Map<string, WorkerSignal>()
    tickets.set(signal.ticket, signal)
    byRun.set(runId, tickets)
  }
  for (const reservation of reservations) {
    add(reservation.runId, {
      ticket: reservation.ticket,
      branch: null,
      pullRequest: findPullRequest(pullRequests, null, reservation.ticket),
      stalled: false,
    })
  }
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry)
    if (!owner) continue
    add(owner.runId, {
      ticket: owner.ticket,
      branch: entry.branch,
      pullRequest: findPullRequest(pullRequests, entry.branch, owner.ticket),
      stalled: stalledDirectories.has(entry.directory),
    })
  }
  return [...byRun].map(([runId, tickets]) => ({
    runId,
    runVerdict: runVerdicts.get(runId) ?? 'dead',
    workers: [...tickets.values()],
  }))
}

async function newestTranscript(directory: string): Promise<string | null> {
  const agentId = /^agent-(.+)$/.exec(path.basename(directory))?.[1]
  if (!agentId) return null
  const projectsDirectory = path.join(os.homedir(), '.claude', 'projects')
  let newest: { file: string; mtimeMs: number } | null = null
  try {
    const glob = new Bun.Glob(`*/*/subagents/agent-${agentId}.jsonl`)
    for await (const name of glob.scan({ cwd: projectsDirectory, onlyFiles: true })) {
      const file = path.join(projectsDirectory, name)
      const mtimeMs = Bun.file(file).lastModified
      if (!newest || mtimeMs > newest.mtimeMs) newest = { file, mtimeMs }
    }
  } catch {
    return null
  }
  return newest?.file ?? null
}

async function fetchPullRequests(): Promise<Map<string, PullRequestStatus>> {
  const output =
    await Bun.$`gh pr list --state all --limit 100 --json number,state,headRefName,body,mergeable,reviewDecision,statusCheckRollup`
      .nothrow()
      .quiet()
  if (output.exitCode !== 0) return new Map()
  return parsePullRequests(output.stdout.toString())
}

function readSpecFlag(argv: readonly string[]): string | null {
  const index = argv.indexOf('--spec')
  const value = index === -1 ? undefined : argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

export async function run(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(STATUS_USAGE)
    return
  }
  try {
    if (argv.includes('--spec') && readSpecFlag(argv) === null) {
      console.error('forge status: --spec requires a value')
      process.exitCode = 2
      return
    }
    const spec = readSpecFlag(argv)
    if (!(await resolveRepoRoot())) {
      console.error('forge status: not inside a git repository')
      process.exitCode = 2
      return
    }
    const [slots, reservations, entries, pullRequests] = await Promise.all([
      listOccupiedSlots(),
      listReservations(),
      listWorktreeEntries(),
      fetchPullRequests(),
    ])
    const runVerdicts = new Map<string, RunVerdict>()
    for (const slot of slots) runVerdicts.set(slot.holder.runId, slot.verdict)
    for (const reservation of reservations) {
      if (runVerdicts.has(reservation.runId)) continue
      runVerdicts.set(
        reservation.runId,
        classifyRun(reservation.anchorPid, reservation.sessionSlug, reservation.runId, {
          ...optionalProperty('anchorStartToken', reservation.anchorStartToken),
        }),
      )
    }
    const thresholds = {
      idleMinutes: DEFAULT_FORGE_CONFIG.usage.stalledMinutes,
      pendingToolMinutes: 30,
    }
    const stalledDirectories = new Set<string>()
    for (const entry of entries) {
      if (!resolveWorktreeOwner(entry)) continue
      const transcript = await newestTranscript(entry.directory)
      if (!transcript) continue
      const stalled = await findStalledTranscripts([transcript], Date.now(), thresholds)
      if (stalled.length > 0) stalledDirectories.add(entry.directory)
    }
    const report = buildStatusReport(
      groupWorkers(entries, reservations, pullRequests, stalledDirectories, runVerdicts),
      spec,
    )
    console.log(JSON.stringify(report, null, 2))
    console.log(summarize(report))
  } catch (error: unknown) {
    console.error(error)
    process.exitCode = 3
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
