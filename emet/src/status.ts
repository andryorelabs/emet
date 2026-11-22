/**
 * `emet status [--spec <id>]` — one answer to "where is my wave?".
 *
 * Merges runs (slot holders), claims (ticket reservations), worktrees (locked
 * by `emet lock-reason`) and the PR of each worker branch into one state per
 * wave: `working | checking | ready | needs-decision`. A host with no wave at
 * all reports `idle`. Prints a JSON report, then a one-line human summary.
 *
 * Stalled workers (the `usage` stalled signal) force `needs-decision`. A
 * Codex worker is judged from its JSONL stream (`threadId` + `jsonlPath`),
 * never from its pid alone, which may come from another pid namespace.
 */

import path from "node:path";

import { resolveAgentHost, type AgentHost } from "./agenthost";
import { claudeHost } from "./agenthost-claude";
import { readSessionAttention, type SessionAttention } from "./attention";
import { listReservations } from "./claims";
import {
  codexWorkerLiveness,
  readCodexState,
  refreshThreadId,
  type CodexWorkerLiveness,
  type LivenessProbe,
} from "./codex-process";
import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfigWithDefaults,
  resolveAgentHostName,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import { resolveLandingUnit } from "./landing-unit";
import { BINARY, LEGACY_PRODUCT, PRODUCT, resolveRunDir } from "./names";
import { isObject } from "./narrow";
import { optionalProperty } from "./optional";
import { present } from "./present";
import { classifyRun, type RunVerdict } from "./runs";
import { listOccupiedSlots } from "./slots";
import { readSpecBranchState } from "./specbranch";
import { findStalledTranscripts, readLastStepFor } from "./usage";
import {
  classifyByContent,
  isSafeToDelete,
  listWorktreeEntries,
  resolveMainTree,
  resolveWorktreeOwner,
  type WorktreeEntry,
} from "./worktrees";

type WaveState = "working" | "checking" | "ready" | "needs-decision";
type OverallState = WaveState | "idle";
export type ChecksState = "passing" | "failing" | "pending" | "none" | "env-fault";
export interface PullRequestStatus {
  readonly number: number;
  readonly state: "open" | "merged" | "closed";
  readonly checks: ChecksState;
  readonly mergeable: boolean | null;
  readonly changesRequested: boolean;
}

export interface WorkerSignal {
  readonly ticket: string;
  readonly branch: string | null;
  readonly pullRequest: PullRequestStatus | null;
  readonly stalled: boolean;
  /** Codex workers only: the liveness read from the JSONL stream. */
  readonly liveness?: CodexWorkerLiveness;
  /** Codex workers only: the thread id, `null` until `thread.started`. */
  readonly threadId?: string | null;
}

/** A Codex worker's identity and liveness, keyed by worktree directory. */
export interface CodexWorkerView {
  readonly liveness: CodexWorkerLiveness;
  readonly threadId: string | null;
}

export interface WaveInput {
  readonly runId: string;
  readonly runVerdict: RunVerdict;
  readonly workers: readonly WorkerSignal[];
}

type WorkerReport = WorkerSignal & {
  readonly state: WaveState;
  readonly reason: string;
};

interface WaveReport {
  readonly runId: string;
  readonly spec: string | null;
  readonly wave: number | null;
  readonly runVerdict: RunVerdict;
  readonly state: WaveState;
  readonly workers: readonly WorkerReport[];
}

/** One live session of this repo: its latest attention state. */
export type SessionReport = Pick<
  SessionAttention,
  "sessionId" | "state" | "blocked" | "since" | "runId"
>;

export interface StatusReport {
  readonly state: OverallState;
  readonly spec: string | null;
  readonly sessions: readonly SessionReport[];
  readonly specBranch?: { branch: string; tip: string; integratedWaves: number[] };
  readonly waves: readonly WaveReport[];
}

const RUN_ID_PATTERN = new RegExp(
  `^(?:${PRODUCT}|${LEGACY_PRODUCT})([a-z0-9][a-z0-9-]*)w(\\d+?)(\\d{6})$`,
);

const STATUS_USAGE = `usage: ${BINARY} status [--spec <id>] [--brief]

Prints one JSON object, then a one-line summary. --brief prints at most three
lines instead: state, what waits on a person, next action.

"sessions" lists the latest attention state of each emet-owned session of this
repo within the last 24 hours, ended sessions excluded; "blocked" is true when
the session needs a decision, "since" is when it entered that state. Any
blocked session makes the overall state needs-decision, also with no wave.

JSON shape:
  {
    "state": "idle" | "working" | "checking" | "ready" | "needs-decision",
    "spec": "<id>" | null,
    "sessions": [{ "sessionId": string, "state": "working"|"needs-decision"|"idle",
      "blocked": boolean, "since": "<ISO timestamp>", "runId": string | null }],
    "specBranch"?: { "branch": string, "tip": string, "integratedWaves": number[] },
    "waves": [{
      "runId": string, "spec": string | null, "wave": number | null,
      "runVerdict": "live" | "idle" | "dead",
      "state": "working" | "checking" | "ready" | "needs-decision",
      "workers": [{
        "ticket": string, "branch": string | null,
        "pullRequest": null | { "number", "state": "open"|"merged"|"closed",
          "checks": "passing"|"failing"|"pending"|"none"|"env-fault",
          "mergeable": boolean | null, "changesRequested": boolean },
        "stalled": boolean, "state": <wave state>, "reason": string,
        "liveness"?: "live"|"done"|"exited"|"stalled", "threadId"?: string | null
      }]
    }]
  }

Overall state is the most urgent wave state: needs-decision > ready >
checking > working. No active run reports "idle". Run ids shaped
emet<spec>w<wave><HHMMSS> (or the legacy forge prefix) carry their spec and wave for --spec filtering.`;

const STATE_PRIORITY: readonly WaveState[] = ["needs-decision", "ready", "checking", "working"];

export function parseRunIdentity(runId: string): {
  spec: string | null;
  wave: number | null;
} {
  const match = RUN_ID_PATTERN.exec(runId);
  if (!match) return { spec: null, wave: null };
  return { spec: present(match[1]), wave: Number(match[2]) };
}

function classifyWorker(
  worker: WorkerSignal,
  runVerdict: RunVerdict,
): { state: WaveState; reason: string } {
  const pullRequest = worker.pullRequest;
  if (worker.stalled) return { state: "needs-decision", reason: "worker stalled" };
  if (pullRequest) {
    if (pullRequest.state === "merged") return { state: "ready", reason: "merged" };
    if (pullRequest.state === "closed") {
      return { state: "needs-decision", reason: "PR closed without merging" };
    }
    if (pullRequest.changesRequested) {
      return { state: "needs-decision", reason: "changes requested" };
    }
    if (pullRequest.checks === "failing") {
      return { state: "needs-decision", reason: "checks failing" };
    }
    if (pullRequest.checks === "env-fault") {
      return { state: "needs-decision", reason: "checks never ran (environment fault)" };
    }
    if (pullRequest.mergeable === false) {
      return { state: "needs-decision", reason: "merge conflict" };
    }
    if (pullRequest.checks === "pending") {
      return { state: "checking", reason: "checks running" };
    }
    return { state: "ready", reason: "PR green and mergeable" };
  }
  if (runVerdict === "dead") {
    return { state: "needs-decision", reason: "run is dead and no PR exists" };
  }
  return { state: "working", reason: "no PR yet" };
}

function classifyWave(wave: WaveInput): WaveReport {
  const workers: WorkerReport[] = wave.workers.map((worker) => ({
    ...worker,
    ...classifyWorker(worker, wave.runVerdict),
  }));
  const states = new Set(workers.map((worker) => worker.state));
  let state: WaveState = "working";
  if (states.has("needs-decision")) state = "needs-decision";
  else if (workers.length > 0 && workers.every((worker) => worker.state === "ready")) {
    state = "ready";
  } else if (states.has("working")) state = "working";
  else if (states.has("checking")) state = "checking";
  return {
    runId: wave.runId,
    ...parseRunIdentity(wave.runId),
    runVerdict: wave.runVerdict,
    state,
    workers,
  };
}

export function buildStatusReport(
  waves: readonly WaveInput[],
  spec: string | null,
  sessions: readonly SessionReport[] = [],
): StatusReport {
  const reports = waves
    .map(classifyWave)
    .filter((report) => spec === null || report.spec === spec)
    .toSorted((a, b) => a.runId.localeCompare(b.runId));
  const waveState: OverallState =
    STATE_PRIORITY.find((candidate) => reports.some((report) => report.state === candidate)) ??
    "idle";
  const state: OverallState = sessions.some((session) => session.blocked)
    ? "needs-decision"
    : waveState;
  return { state, spec, sessions, waves: reports };
}

function blockedSessions(report: StatusReport): readonly SessionReport[] {
  return report.sessions.filter((session) => session.blocked);
}

function blockedSummary(report: StatusReport): string | null {
  const count = blockedSessions(report).length;
  return count === 0 ? null : `${count} session(s) blocked`;
}

export function summarize(report: StatusReport): string {
  const blocked = blockedSummary(report);
  if (report.waves.length === 0) {
    if (blocked) return `${BINARY} status: ${report.state} — ${blocked}`;
    return `${BINARY} status: idle — no active wave${report.spec ? ` for spec ${report.spec}` : ""}`;
  }
  const parts = report.waves.map((wave) => {
    const label = wave.wave === null ? wave.runId : `wave ${wave.wave}`;
    const reasons = [
      ...new Set(wave.workers.filter((w) => w.state === wave.state).map((w) => w.reason)),
    ];
    return `${label} ${wave.state} (${wave.workers.length} worker(s)${reasons.length ? `: ${reasons.join(", ")}` : ""})`;
  });
  return `${BINARY} status: ${report.state} — ${[...parts, ...(blocked ? [blocked] : [])].join("; ")}`;
}

const BRIEF_NEXT_ACTION: Readonly<Record<OverallState, string>> = {
  idle: `next: start a run with /${PRODUCT}:run`,
  working: "next: wait for the workers to open their PRs",
  checking: "next: wait for the checks to finish",
  ready: "next: land the wave",
  "needs-decision": "next: decide on the flagged tickets, then re-run status",
};

function sessionsWaitingLine(report: StatusReport): string | null {
  const blocked = blockedSessions(report);
  if (blocked.length === 0) return null;
  const ids = blocked.map((session) => session.sessionId).join(", ");
  return `waiting on you: ${blocked.length} session(s) need a decision (${ids})`;
}

function waitingLine(report: StatusReport): string | null {
  return waveWaitingLine(report) ?? sessionsWaitingLine(report);
}

function waveWaitingLine(report: StatusReport): string | null {
  const waiting = report.waves.find((wave) => wave.state === report.state);
  if (report.state !== "needs-decision" && report.state !== "ready") return null;
  if (!waiting) return null;
  const label = waiting.wave === null ? waiting.runId : `wave ${waiting.wave}`;
  const reasons = [
    ...new Set(waiting.workers.filter((w) => w.state === waiting.state).map((w) => w.reason)),
  ];
  const what = report.state === "ready" ? "ready to land" : "needs a decision";
  return `waiting on you: ${label} ${what}${reasons.length ? ` (${reasons.join(", ")})` : ""}`;
}

/** At most three lines for `status --brief`: overall state, what waits on a person, next action. */
export function briefLines(report: StatusReport): string[] {
  const state = `state: ${report.state}${report.spec ? ` (spec ${report.spec})` : ""}`;
  const waiting = waitingLine(report);
  return [state, ...(waiting ? [waiting] : []), BRIEF_NEXT_ACTION[report.state]];
}

interface RawPullRequest {
  number: number;
  state: string;
  headRefName: string;
  body?: string | null;
  mergeable?: string;
  reviewDecision?: string | null;
  statusCheckRollup?: RawCheck[] | null;
}

const FAILED_CONCLUSIONS = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"]);
const STARTUP_FAILURE = "STARTUP_FAILURE";
const DEFAULT_QUEUED_STALE_MS = 30 * 60 * 1000;

export interface RawCheck {
  conclusion?: string | null;
  status?: string;
  state?: string;
  name?: string;
  detailsUrl?: string;
  startedAt?: string;
}

function toRawCheck(raw: unknown): RawCheck {
  if (!isObject(raw)) return {};
  const { conclusion, status, state, name, context, detailsUrl, targetUrl, startedAt } = raw;
  const label = typeof name === "string" ? name : context;
  const url = typeof detailsUrl === "string" ? detailsUrl : targetUrl;
  return {
    ...(typeof conclusion === "string" || conclusion === null ? { conclusion } : {}),
    ...(typeof status === "string" ? { status } : {}),
    ...(typeof state === "string" ? { state } : {}),
    ...(typeof label === "string" ? { name: label } : {}),
    ...(typeof url === "string" ? { detailsUrl: url } : {}),
    ...(typeof startedAt === "string" ? { startedAt } : {}),
  };
}

/** Parses the `statusCheckRollup` of `gh pr view --json statusCheckRollup` output. */
export function parseCheckRollup(json: string): RawCheck[] {
  const parsed: unknown = JSON.parse(json);
  if (!isObject(parsed)) return [];
  const { statusCheckRollup } = parsed;
  return Array.isArray(statusCheckRollup) ? statusCheckRollup.map(toRawCheck) : [];
}

function conclusionOf(check: RawCheck): string {
  return check.conclusion ?? check.state ?? "";
}

/** True for a check that failed on its own merits. */
export function isCodeFailure(check: RawCheck): boolean {
  return FAILED_CONCLUSIONS.has(conclusionOf(check));
}

/** True when a check has not completed yet. */
export function isUnfinished(check: RawCheck): boolean {
  return check.status !== undefined
    ? check.status !== "COMPLETED"
    : check.state === "PENDING" || check.state === "EXPECTED";
}

function isStaleQueued(check: RawCheck, nowMs: number, queuedStaleMs: number): boolean {
  if (check.status !== "QUEUED" || check.startedAt === undefined) return false;
  const startedMs = Date.parse(check.startedAt);
  return !Number.isNaN(startedMs) && startedMs > 0 && nowMs - startedMs >= queuedStaleMs;
}

/**
 * Classifies a PR's checks. A code failure wins; otherwise a check that ended
 * `STARTUP_FAILURE`, or stayed queued past `queuedStaleMs`, is an `env-fault`
 * because the CI never ran.
 */
export function classifyChecks(
  checks: readonly RawCheck[],
  options: { nowMs: number; queuedStaleMs: number },
): ChecksState {
  if (checks.length === 0) return "none";
  if (checks.some(isCodeFailure)) return "failing";
  const neverRan = checks.some(
    (check) =>
      conclusionOf(check) === STARTUP_FAILURE ||
      isStaleQueued(check, options.nowMs, options.queuedStaleMs),
  );
  if (neverRan) return "env-fault";
  return checks.some(isUnfinished) ? "pending" : "passing";
}

function toRawPullRequest(raw: unknown): RawPullRequest | null {
  if (!isObject(raw)) return null;
  const { number, state, headRefName, body, mergeable, reviewDecision, statusCheckRollup } = raw;
  if (typeof number !== "number" || typeof state !== "string" || typeof headRefName !== "string") {
    return null;
  }
  const checks: unknown[] | null | undefined = Array.isArray(statusCheckRollup)
    ? statusCheckRollup
    : undefined;
  return {
    number,
    state,
    headRefName,
    ...(typeof body === "string" || body === null ? { body } : {}),
    ...(typeof mergeable === "string" ? { mergeable } : {}),
    ...(typeof reviewDecision === "string" || reviewDecision === null ? { reviewDecision } : {}),
    ...(checks === undefined ? {} : { statusCheckRollup: checks.map(toRawCheck) }),
  };
}

export function parsePullRequests(json: string): Map<string, PullRequestStatus> {
  const result = new Map<string, PullRequestStatus>();
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new TypeError("gh pr list output was not a JSON array");
  const rawItems: unknown[] = parsed;
  for (const item of rawItems.flatMap((raw) => toRawPullRequest(raw) ?? [])) {
    const checksState = classifyChecks(item.statusCheckRollup ?? [], {
      nowMs: Date.now(),
      queuedStaleMs: DEFAULT_QUEUED_STALE_MS,
    });
    const status: PullRequestStatus = {
      number: item.number,
      state: item.state === "MERGED" ? "merged" : item.state === "CLOSED" ? "closed" : "open",
      checks: checksState,
      mergeable:
        item.mergeable === "CONFLICTING" ? false : item.mergeable === "MERGEABLE" ? true : null,
      changesRequested: item.reviewDecision === "CHANGES_REQUESTED",
    };
    result.set(item.headRefName, status);
    for (const issueNumber of closingIssueNumbers(item.body ?? "")) {
      const key = `#${issueNumber}`;
      if (!result.has(key)) result.set(key, status);
    }
  }
  return result;
}

/**
 * A wave opens one PR from its integration branch, never from a worker branch,
 * and closes its tickets with `Closes #N, #M`. Those issue numbers are the only
 * link between a worker and its wave's PR, so they are indexed as `#<n>` keys.
 */
export function closingIssueNumbers(body: string): string[] {
  const numbers: string[] = [];
  for (const line of body.split("\n")) {
    const match = /^\s*(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(.*)$/i.exec(line);
    if (!match) continue;
    for (const reference of present(match[1]).matchAll(/#(\d+)/g))
      numbers.push(present(reference[1]));
  }
  return numbers;
}

function findPullRequest(
  pullRequests: ReadonlyMap<string, PullRequestStatus>,
  branch: string | null,
  ticket: string,
): PullRequestStatus | null {
  const byBranch = branch ? pullRequests.get(branch) : undefined;
  if (byBranch) return byBranch;
  const issueNumber = /(\d+)$/.exec(ticket)?.[1];
  return issueNumber ? (pullRequests.get(`#${issueNumber}`) ?? null) : null;
}

export function groupWorkers(
  entries: readonly WorktreeEntry[],
  reservations: readonly { runId: string; ticket: string }[],
  pullRequests: ReadonlyMap<string, PullRequestStatus>,
  stalledDirectories: ReadonlySet<string>,
  runVerdicts: ReadonlyMap<string, RunVerdict>,
  codexWorkers: ReadonlyMap<string, CodexWorkerView> = new Map(),
): WaveInput[] {
  const byRun = new Map<string, Map<string, WorkerSignal>>();
  const add = (runId: string, signal: WorkerSignal) => {
    const tickets = byRun.get(runId) ?? new Map<string, WorkerSignal>();
    tickets.set(signal.ticket, signal);
    byRun.set(runId, tickets);
  };
  for (const reservation of reservations) {
    add(reservation.runId, {
      ticket: reservation.ticket,
      branch: null,
      pullRequest: findPullRequest(pullRequests, null, reservation.ticket),
      stalled: false,
    });
  }
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry);
    if (!owner) continue;
    const codex = codexWorkers.get(entry.directory);
    add(owner.runId, {
      ticket: owner.ticket,
      branch: entry.branch,
      pullRequest: findPullRequest(pullRequests, entry.branch, owner.ticket),
      stalled:
        codex === undefined
          ? stalledDirectories.has(entry.directory)
          : codex.liveness === "stalled",
      ...(codex === undefined ? {} : { liveness: codex.liveness, threadId: codex.threadId }),
    });
  }
  return [...byRun].map(([runId, tickets]) => ({
    runId,
    runVerdict: runVerdicts.get(runId) ?? "dead",
    workers: [...tickets.values()],
  }));
}

/**
 * Reads each owned worktree's Codex state under `runsRoot/<run>/codex/` and
 * judges it from its JSONL stream. Worktrees with no state are left out.
 */
export function readCodexWorkers(
  entries: readonly WorktreeEntry[],
  runsRoot: string,
  probe: LivenessProbe,
): Map<string, CodexWorkerView> {
  const workers = new Map<string, CodexWorkerView>();
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry);
    if (!owner) continue;
    const stateFile = path.join(runsRoot, owner.runId, "codex", `${owner.ticket}.state.json`);
    const state = readCodexState(stateFile);
    if (state === undefined) continue;
    workers.set(entry.directory, {
      liveness: codexWorkerLiveness(state, probe),
      threadId: refreshThreadId(stateFile)?.threadId ?? state.threadId,
    });
  }
  return workers;
}

async function newestTranscript(
  directory: string,
  host: AgentHost = claudeHost,
): Promise<string | null> {
  const agentId = /^agent-(.+)$/.exec(path.basename(directory))?.[1];
  if (!agentId) return null;
  const claudeLayout = host.transcriptFormat === "claude-jsonl";
  const workerRoot = host.workerTranscriptRoot(directory);
  const projectsDirectory = claudeLayout ? path.dirname(workerRoot) : workerRoot;
  let newest: { file: string; mtimeMs: number } | null = null;
  try {
    const glob = new Bun.Glob(
      claudeLayout ? `*/*/subagents/agent-${agentId}.jsonl` : host.workerTranscriptGlob,
    );
    for await (const name of glob.scan({ cwd: projectsDirectory, onlyFiles: true })) {
      if (!claudeLayout && !path.basename(name).includes(agentId)) continue;
      const file = path.join(projectsDirectory, name);
      const mtimeMs = Bun.file(file).lastModified;
      if (!newest || mtimeMs > newest.mtimeMs) newest = { file, mtimeMs };
    }
  } catch {
    return null;
  }
  return newest?.file ?? null;
}

/**
 * In `landing.mode: merge` there is no PR: a worker branch is landed when its
 * content is already in local trunk (ancestor, or an equivalent squash). It is
 * reported as a merged pull request numbered 0 so `classifyWorker` is shared.
 */
export async function localLandedBranches(
  entries: readonly WorktreeEntry[],
  config: Pick<ForgeConfig, "repo">,
): Promise<Map<string, PullRequestStatus>> {
  const landed = new Map<string, PullRequestStatus>();
  const { remote, trunk } = config.repo;
  const mainTree = await resolveMainTree(remote, trunk, { local: true });
  for (const entry of entries) {
    if (!entry.branch || entry.branch.startsWith("worktree-agent-")) continue;
    if (!resolveWorktreeOwner(entry)) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const verdict = await classifyByContent(entry.branch, mainTree, remote, trunk, {
      local: true,
    });
    if (!isSafeToDelete(verdict)) continue;
    landed.set(entry.branch, {
      number: 0,
      state: "merged",
      checks: "none",
      mergeable: null,
      changesRequested: false,
    });
  }
  return landed;
}

async function fetchPullRequests(): Promise<Map<string, PullRequestStatus>> {
  const output =
    await Bun.$`gh pr list --state all --limit 100 --json number,state,headRefName,body,mergeable,reviewDecision,statusCheckRollup`
      .nothrow()
      .quiet();
  if (output.exitCode !== 0) return new Map();
  return parsePullRequests(output.stdout.toString());
}

function readSpecFlag(argv: readonly string[]): string | null {
  const index = argv.indexOf("--spec");
  const value = index === -1 ? undefined : argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

/** Collaborators of {@link run}; each default keeps today's behaviour. */
export interface StatusDeps {
  readonly resolveRepoRoot: typeof resolveRepoRoot;
  readonly listOccupiedSlots: typeof listOccupiedSlots;
  readonly listReservations: typeof listReservations;
  readonly listWorktreeEntries: typeof listWorktreeEntries;
  readonly fetchPullRequests: typeof fetchPullRequests;
  readonly resolveAgentHost: typeof resolveAgentHost;
  readonly findStalledTranscripts: typeof findStalledTranscripts;
  readonly readSessionAttention: typeof readSessionAttention;
}

const DEFAULT_STATUS_DEPS: StatusDeps = {
  resolveRepoRoot,
  listOccupiedSlots,
  listReservations,
  listWorktreeEntries,
  fetchPullRequests,
  resolveAgentHost,
  findStalledTranscripts,
  readSessionAttention,
};

function readSessions(deps: StatusDeps, repoRoot: string): SessionReport[] {
  try {
    return deps.readSessionAttention({ repo: repoRoot }).map((session) => ({
      sessionId: session.sessionId,
      state: session.state,
      blocked: session.blocked,
      since: session.since,
      runId: session.runId,
    }));
  } catch (error: unknown) {
    console.error(`${BINARY} status: could not read session attention: ${String(error)}`);
    return [];
  }
}

export async function run(argv: string[], overrides: Partial<StatusDeps> = {}): Promise<void> {
  const deps: StatusDeps = { ...DEFAULT_STATUS_DEPS, ...overrides };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(STATUS_USAGE);
    return;
  }
  try {
    if (argv.includes("--spec") && readSpecFlag(argv) === null) {
      console.error(`${BINARY} status: --spec requires a value`);
      process.exitCode = 2;
      return;
    }
    const spec = readSpecFlag(argv);
    const repoRoot = await deps.resolveRepoRoot();
    if (!repoRoot) {
      console.error(`${BINARY} status: not inside a git repository`);
      process.exitCode = 2;
      return;
    }
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const host = deps.resolveAgentHost(resolveAgentHostName(config));
    const localLanding = config.landing.mode === "merge";
    const [slots, reservations, entries] = await Promise.all([
      deps.listOccupiedSlots(),
      deps.listReservations(),
      deps.listWorktreeEntries(),
    ]);
    const pullRequests = localLanding
      ? await localLandedBranches(entries, config)
      : await deps.fetchPullRequests();
    const runVerdicts = new Map<string, RunVerdict>();
    for (const slot of slots) runVerdicts.set(slot.holder.runId, slot.verdict);
    for (const reservation of reservations) {
      if (runVerdicts.has(reservation.runId)) continue;
      runVerdicts.set(
        reservation.runId,
        classifyRun(reservation.anchorPid, reservation.sessionSlug, reservation.runId, {
          ...optionalProperty("anchorStartToken", reservation.anchorStartToken),
        }),
      );
    }
    const thresholds = {
      idleMinutes: DEFAULT_FORGE_CONFIG.usage.stalledMinutes,
      pendingToolMinutes: 30,
    };
    const codexWorkers =
      resolveAgentHostName(config) === "codex"
        ? readCodexWorkers(entries, path.join(resolveRunDir(repoRoot).path, "runs"), {
            idleMs: config.usage.stalledMinutes * 60_000,
          })
        : new Map<string, CodexWorkerView>();
    const stalledDirectories = new Set<string>();
    for (const entry of entries) {
      if (!resolveWorktreeOwner(entry) || codexWorkers.has(entry.directory)) continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const transcript = await newestTranscript(entry.directory, host);
      if (!transcript) continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const stalled = await deps.findStalledTranscripts(
        [transcript],
        Date.now(),
        thresholds,
        undefined,
        readLastStepFor(host),
      );
      if (stalled.length > 0) stalledDirectories.add(entry.directory);
    }
    const baseReport = buildStatusReport(
      groupWorkers(
        entries,
        reservations,
        pullRequests,
        stalledDirectories,
        runVerdicts,
        codexWorkers,
      ),
      spec,
      readSessions(deps, repoRoot),
    );
    const expectsSpecBranch =
      config.landing.unit === "spec" &&
      baseReport.waves.every((wave) => resolveLandingUnit(config, wave.runId, repoRoot) === "spec");
    const branchState =
      expectsSpecBranch && spec !== null ? await readSpecBranchState(repoRoot, spec) : null;
    const report: StatusReport =
      branchState === null
        ? baseReport
        : {
            ...baseReport,
            specBranch: {
              branch: branchState.branch,
              tip: branchState.tip,
              integratedWaves: branchState.waves.map((entry) => entry.wave),
            },
          };
    if (argv.includes("--brief")) {
      for (const line of briefLines(report)) console.log(line);
      return;
    }
    console.log(JSON.stringify(report, null, 2));
    console.log(summarize(report));
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 3;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
