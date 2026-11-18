/**
 * `emet insights`: reads every journal segment and reports runs by origin,
 * gate decisions, human interventions, launch outcomes and tickets closed.
 * `--mark-baseline` appends a `baseline` event; without `--all` the report
 * covers only events after the latest one.
 */

import path from "node:path";

import { resolveRepoRoot } from "./config";
import { stringifySorted } from "./envelope";
import { exitCodes } from "./exit-codes";
import { appendEvent, readJournalSegments, type JournalDeps, type JournalEvent } from "./journal";

/** The aggregate `emet insights` prints. */
export interface InsightsReport {
  runsByOrigin: Record<"human" | "auto", number>;
  gateByDecision: Record<string, number>;
  topReasons: { reason: string; count: number }[];
  interventionsPerRun: number;
  launches: { ok: number; failed: number };
  ticketsClosed: number;
  skippedLines: number;
}

/** Filters for `summarizeJournal`; `since` is epoch milliseconds. */
export interface SummarizeOptions {
  since?: number;
  repo?: string;
  all: boolean;
}

const USAGE =
  "usage: emet insights [--since <iso|7d|30d>] [--repo <path>] [--all] [--json] [--mark-baseline]";
const TOP_REASON_LIMIT = 5;
const DAY_MS = 86_400_000;
const FAILED_OUTCOMES = new Set(["failed", "failure", "error", "timeout", "unverified"]);
const KNOWN_FLAGS = new Set(["--since", "--repo", "--json", "--all", "--mark-baseline"]);

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function waveKey(event: JournalEvent): string {
  return `${String(event.data.spec)}#${String(event.data.wave)}`;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function afterLatestBaseline(events: readonly JournalEvent[]): readonly JournalEvent[] {
  const lastBaseline = events.findLastIndex((event) => event.kind === "baseline");
  return lastBaseline === -1 ? events : events.slice(lastBaseline + 1);
}

function selectEvents(
  events: readonly JournalEvent[],
  options: SummarizeOptions,
): readonly JournalEvent[] {
  const scoped = options.all ? events : afterLatestBaseline(events);
  return scoped.filter((event) => {
    if (options.repo !== undefined && event.repo !== options.repo) return false;
    return options.since === undefined || Date.parse(event.ts) >= options.since;
  });
}

/** Aggregates journal events into an `InsightsReport`; `skippedLines` is left at zero for the caller. */
export function summarizeJournal(
  events: readonly JournalEvent[],
  options: SummarizeOptions,
): InsightsReport {
  const selected = selectEvents(events, options);
  const launchedWaves = new Set(
    selected.filter((event) => event.kind === "launch.result").map(waveKey),
  );
  const report: InsightsReport = {
    runsByOrigin: { human: 0, auto: 0 },
    gateByDecision: {},
    topReasons: [],
    interventionsPerRun: 0,
    launches: { ok: 0, failed: 0 },
    ticketsClosed: 0,
    skippedLines: 0,
  };
  const reasonCounts: Record<string, number> = {};
  let interventions = 0;
  for (const event of selected) {
    if (event.kind === "run.start") {
      const origin =
        event.origin === "auto" || launchedWaves.has(waveKey(event)) ? "auto" : "human";
      report.runsByOrigin[origin] += 1;
    } else if (event.kind === "gate.decision") {
      increment(report.gateByDecision, text(event.data.decision) ?? "unknown");
      const reason = text(event.data.reason);
      if (reason !== undefined) increment(reasonCounts, reason);
    } else if (event.kind === "intervention") {
      interventions += 1;
    } else if (event.kind === "launch.result") {
      const failed = FAILED_OUTCOMES.has(text(event.data.outcome) ?? "");
      report.launches[failed ? "failed" : "ok"] += 1;
    } else if (event.kind === "ticket.close") {
      report.ticketsClosed += 1;
    }
  }
  report.topReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .toSorted((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, TOP_REASON_LIMIT);
  const runs = report.runsByOrigin.human + report.runsByOrigin.auto;
  report.interventionsPerRun = runs === 0 ? 0 : Math.round((interventions / runs) * 100) / 100;
  return report;
}

/** Parses `--since`: an ISO date or `<n>d`; returns epoch milliseconds or `undefined` when invalid. */
export function parseSince(value: string, now: number): number | undefined {
  const days = /^(\d+)d$/.exec(value)?.[1];
  if (days !== undefined) return now - Number(days) * DAY_MS;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Renders the report as human-readable lines. */
export function formatReport(report: InsightsReport): string {
  const decisions = Object.entries(report.gateByDecision)
    .map(([decision, count]) => `${decision}=${count}`)
    .join(" ");
  return [
    `runs: human=${report.runsByOrigin.human} auto=${report.runsByOrigin.auto}`,
    `gate decisions: ${decisions === "" ? "none" : decisions}`,
    ...report.topReasons.map((entry) => `  reason (${entry.count}): ${entry.reason}`),
    `interventions per run: ${report.interventionsPerRun}`,
    `launches: ok=${report.launches.ok} failed=${report.launches.failed}`,
    `tickets closed: ${report.ticketsClosed}`,
    `skipped lines: ${report.skippedLines}`,
  ].join("\n");
}

function fail(message: string): void {
  console.error(`emet insights: ${message}\n${USAGE}`);
  process.exitCode = exitCodes.usage;
}

interface ParsedArguments {
  since?: string;
  repo?: string;
  json: boolean;
  all: boolean;
  markBaseline: boolean;
}

function parseArguments(argv: readonly string[]): ParsedArguments | string {
  const parsed: ParsedArguments = { json: false, all: false, markBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? "";
    if (!KNOWN_FLAGS.has(flag)) return `unknown argument ${flag}`;
    if (flag === "--json") parsed.json = true;
    else if (flag === "--all") parsed.all = true;
    else if (flag === "--mark-baseline") parsed.markBaseline = true;
    else {
      index += 1;
      const value = argv[index];
      if (value === undefined) return `${flag} needs a value`;
      if (flag === "--since") parsed.since = value;
      else parsed.repo = path.resolve(value);
    }
  }
  return parsed;
}

/** Runs `emet insights`; `deps` is the journal test seam. */
export async function run(argv: string[], deps?: JournalDeps): Promise<void> {
  const args = parseArguments(argv);
  if (typeof args === "string") {
    fail(args);
    return;
  }
  if (args.markBaseline) {
    const repo = (await resolveRepoRoot()) ?? process.cwd();
    appendEvent({ kind: "baseline", repo, origin: "human", data: {} }, deps);
    console.log(args.json ? stringifySorted({ baseline: true }) : "baseline recorded");
    return;
  }
  const since = args.since === undefined ? undefined : parseSince(args.since, Date.now());
  if (args.since !== undefined && since === undefined) {
    fail(`invalid --since ${args.since}`);
    return;
  }
  const { events, skippedLines } = readJournalSegments(deps);
  const options: SummarizeOptions = { all: args.all };
  if (since !== undefined) options.since = since;
  if (args.repo !== undefined) options.repo = args.repo;
  const report = {
    ...summarizeJournal(events, options),
    skippedLines,
  };
  console.log(args.json ? stringifySorted(report) : formatReport(report));
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
