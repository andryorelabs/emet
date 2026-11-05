/**
 * Read-only token-usage report for a `/emet` run. Reads Claude Code
 * transcripts directly (JSONL, one line per event) and prints, per session:
 * turn count, total `cache_read_input_tokens` (the dominant cost term),
 * final context size, the top-10 largest tool results (the usual culprits:
 * unfiltered test output, full-file `Read`s, screenshots), and how many
 * `Read` calls went unbounded (no `offset`/`limit`) against a file over
 * ~400 lines — the locate-before-`Read` discipline `reference/worker-prompt.md` and `reference/phases-6-7-dispatch.md` (Phase 7 step 3) spell out as "Context budget and output
 * hygiene" tripwire that a prose-only instruction measurably failed to
 * prevent in a real 4-worker wave.
 *
 * Never touches Linear, git state, or anything mutable — safe to run at any
 * point, including mid-wave, to sanity-check a worker or the coordinator
 * itself against the plan's targets (peak < 160k, split threshold 240k).
 *
 * Usage:
 *   emet usage                      # most recent coordinator session + its workers
 *   emet usage --session <id>        # a specific coordinator session
 *   emet usage --file <path.jsonl>   # a single transcript file directly
 *   emet usage --stalled [--minutes N]  # find hung subagents (default 10m)
 *   emet usage --stalled --run <id> [--nudge]  # per-ticket state from events + branch commits
 *
 * `--stalled` is the watchdog for a coordinator's own `code-review` fan-out
 * (`docs/agents/emet.md` Phase 8): a sub-agent transcript is a plain file
 * that only grows while its process is actually producing output, so a
 * transcript whose mtime hasn't advanced in N minutes names a hung roster
 * member without needing to inspect the harness's own process/task state at
 * all — the same signal `findWorkerTranscripts` already reads for the
 * default report, just checked for silence instead of summarized.
 */

import os from "node:os";

import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import { BINARY, LEGACY_RUN_DIR, RUN_DIR } from "./names";
import {
  readCompletionEvent,
  recordStallNudge,
  resolveSessionSlug,
  type CompletionEvent,
} from "./runs";
import { isObject } from "./narrow";
import { parseWorktreeEntries, resolveWorktreeOwner } from "./worktrees";

type UsageEntry = {
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
};

type ToolResultSample = {
  readonly name: string;
  readonly chars: number;
};

type TranscriptStats = {
  readonly label: string;
  readonly turns: number;
  readonly cacheReadMillionTokens: number;
  readonly floorContext: number;
  readonly peakContext: number;
  readonly finalContext: number;
  readonly compactBoundaries: number;
  readonly topToolResults: ToolResultSample[];
  readonly oversizedFullReads: number;
};

function contextSize(entry: UsageEntry): number {
  return entry.inputTokens + entry.cacheReadTokens + entry.cacheCreationTokens;
}

/**
 * Records the `tool_use` → name and `tool_result` → size mappings for one
 * message's content blocks, plus the locate-before-`Read` tripwire: every
 * unbounded `Read` (no `offset`/`limit`) file path (via
 * `unboundedReadPaths`, resolved against the filesystem after the
 * transcript scan — see {@link analyzeTranscript}). Extracted out of
 * {@link analyzeTranscript}'s own loop so a `continue` skipping a malformed
 * block never reads as ambiguous about which of the two nested loops it
 * belongs to.
 */
function recordToolBlocks(
  content: unknown[],
  toolNameById: Map<string, string>,
  resultSizeById: Map<string, number>,
  unboundedReadPaths: string[],
): void {
  for (const block of content) {
    if (!isObject(block)) {
      continue;
    }
    const blockRecord = block;
    if (blockRecord.type === "tool_use" && typeof blockRecord.id === "string") {
      const name = typeof blockRecord.name === "string" ? blockRecord.name : "unknown";
      toolNameById.set(blockRecord.id, name);
      if (name === "Read") {
        const input = isObject(blockRecord.input) ? blockRecord.input : undefined;
        const filePath = input && typeof input.file_path === "string" ? input.file_path : undefined;
        const isBounded = Boolean(input && ("offset" in input || "limit" in input));
        if (filePath && !isBounded) {
          unboundedReadPaths.push(filePath);
        }
      }
    }
    if (blockRecord.type === "tool_result" && typeof blockRecord.tool_use_id === "string") {
      resultSizeById.set(blockRecord.tool_use_id, toolResultCharCount(blockRecord.content));
    }
  }
}

/**
 * Default `oversizedThreshold` (line count) below, historically hardcoded —
 * now sourced from `emet.config.json`'s `usage.oversizedReadLines`, this
 * constant survives only as the fallback when a caller doesn't pass one
 * explicitly.
 */
const OVERSIZED_READ_LINE_THRESHOLD = 400;

/**
 * Counts how many of `paths` currently exceed `oversizedThreshold` lines. A
 * path from a cleaned-up worktree (deleted by `emet:cleanup`) silently
 * doesn't count — this is a best-effort signal computed after the fact, not
 * a guarantee, so an unverifiable candidate is dropped rather than assumed
 * guilty.
 */
async function countOversizedReads(
  paths: string[],
  oversizedThreshold: number = OVERSIZED_READ_LINE_THRESHOLD,
): Promise<number> {
  let count = 0;
  for (const path of paths) {
    const file = Bun.file(path);
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    if (!(await file.exists())) {
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const text = await file.text();
    const lineCount = text.split("\n").length;
    if (lineCount > oversizedThreshold) {
      count += 1;
    }
  }
  return count;
}

/**
 * Parses one JSONL transcript in a single streaming pass: usage stats per
 * assistant turn, `compact_boundary` markers, and per-tool-call result
 * sizes (matched by `tool_use_id` across the assistant/user message pair).
 */
async function analyzeTranscript(
  filePath: string,
  label: string,
  oversizedThreshold: number = OVERSIZED_READ_LINE_THRESHOLD,
): Promise<TranscriptStats | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  const text = await file.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  const usageEntries: UsageEntry[] = [];
  let compactBoundaries = 0;
  const toolNameById = new Map<string, string>();
  const resultSizeById = new Map<string, number>();
  const unboundedReadPaths: string[] = [];

  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(event)) {
      continue;
    }
    const record = event;

    if (JSON.stringify(record).includes("compact_boundary")) {
      compactBoundaries += 1;
    }

    const message = isObject(record.message) ? record.message : undefined;
    if (!message) {
      continue;
    }

    const usage = isObject(message.usage) ? message.usage : undefined;
    if (usage && typeof usage.input_tokens === "number") {
      usageEntries.push({
        inputTokens: usage.input_tokens,
        cacheReadTokens: numberOrZero(usage.cache_read_input_tokens),
        cacheCreationTokens: numberOrZero(usage.cache_creation_input_tokens),
      });
    }

    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    recordToolBlocks(content, toolNameById, resultSizeById, unboundedReadPaths);
  }

  if (usageEntries.length === 0) {
    return null;
  }

  const topToolResults: ToolResultSample[] = [...resultSizeById]
    .map(([id, chars]) => ({
      name: toolNameById.get(id) ?? "unknown",
      chars,
    }))
    .toSorted((a, b) => b.chars - a.chars)
    .slice(0, 10);

  let cacheReadTotal = 0;

  for (const entry of usageEntries) {
    cacheReadTotal += entry.cacheReadTokens;
  }
  const peakContext = Math.max(...usageEntries.map((entry) => contextSize(entry)));
  const oversizedFullReads = await countOversizedReads(unboundedReadPaths, oversizedThreshold);

  return {
    label,
    turns: usageEntries.length,
    cacheReadMillionTokens: cacheReadTotal / 1e6,
    floorContext: contextSize(usageEntries[0]!),
    peakContext,
    finalContext: contextSize(usageEntries.at(-1)!),
    oversizedFullReads,
    compactBoundaries,
    topToolResults,
  };
}

function toolResultCharCount(content: unknown): number {
  if (typeof content === "string") {
    return content.length;
  }
  if (Array.isArray(content)) {
    let total = 0;
    for (const part of content) {
      if (!isObject(part)) {
        continue;
      }

      const text = part.text;
      if (typeof text === "string") {
        total += text.length;
      }
    }
    return total;
  }
  return 0;
}

/**
 * Resolves an explicit `--project-dir <path>` off `argv`, defaulting to
 * `process.cwd()`. Needed once `usage` is a subcommand of a global CLI: a
 * coordinator invoking `emet usage` from a worker's own worktree (a
 * different directory than the one that produced the transcript it wants to
 * read) has no other way to point this at the right project slug.
 */
function resolveProjectDirectoryFlag(argv: readonly string[]): string {
  const flagIndex = argv.indexOf("--project-dir");
  const value = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  return value ?? process.cwd();
}

function projectsDirectory(argv: readonly string[] = []): string {
  const projectDirectory = resolveProjectDirectoryFlag(argv);
  return `${os.homedir()}/.claude/projects/${resolveSessionSlug(projectDirectory)}`;
}

async function findMostRecentSessionFile(directory: string): Promise<string | null> {
  const glob = new Bun.Glob("*.jsonl");
  const entries = glob.scan({ cwd: directory, onlyFiles: true });
  let newest: { path: string; mtimeMs: number } | null = null;
  for await (const entry of entries) {
    const path = `${directory}/${entry}`;
    const stat = await Bun.file(path).stat();
    if (!newest || stat.mtimeMs > newest.mtimeMs) {
      newest = { path, mtimeMs: stat.mtimeMs };
    }
  }
  return newest?.path ?? null;
}

async function findWorkerTranscripts(directory: string, sessionId: string): Promise<string[]> {
  const subagentsDirectory = `${directory}/${sessionId}/subagents`;
  const glob = new Bun.Glob("agent-*.jsonl");
  const paths: string[] = [];
  try {
    const entries = glob.scan({ cwd: subagentsDirectory, onlyFiles: true });
    for await (const entry of entries) {
      paths.push(`${subagentsDirectory}/${entry}`);
    }
  } catch {
    return [];
  }
  return paths.toSorted((a, b) => a.localeCompare(b));
}

function printStats(
  stats: TranscriptStats,
  oversizedThreshold: number = OVERSIZED_READ_LINE_THRESHOLD,
): void {
  console.log(`\n=== ${stats.label} ===`);
  console.log(`turns:               ${stats.turns}`);
  console.log(`cache_read (M tok):  ${stats.cacheReadMillionTokens.toFixed(2)}`);
  console.log(`floor context:       ${stats.floorContext.toLocaleString()}`);
  console.log(`peak context:        ${stats.peakContext.toLocaleString()}`);
  console.log(`final context:       ${stats.finalContext.toLocaleString()}`);
  console.log(`compact boundaries:  ${stats.compactBoundaries}`);
  console.log(
    `oversized Read (>${oversizedThreshold} lines, unbounded): ${stats.oversizedFullReads}`,
  );
  if (stats.topToolResults.length > 0) {
    console.log("top tool results:");
    for (const result of stats.topToolResults) {
      console.log(`  ${(result.chars / 1024).toFixed(1)} KB  ${result.name}`);
    }
  }
}

const DEFAULT_STALLED_MINUTES = 10;

const DEFAULT_PENDING_TOOL_MINUTES = 30;

export type StalledThresholds = {
  readonly idleMinutes: number;
  readonly pendingToolMinutes: number;
};

export type LastTranscriptStep = {
  readonly step: string;
  readonly pendingTool: string | null;
};

export type StalledTranscript = {
  readonly taskId: string;
  readonly path: string;
  readonly minutesSinceLastWrite: number;
  readonly lastStep: string;
  readonly pendingTool: string | null;
};

const UNKNOWN_STEP: LastTranscriptStep = { step: "unknown", pendingTool: null };

/**
 * Reads a `--minutes N` value out of raw argv, falling back to
 * `defaultMinutes` (itself defaulting to {@link DEFAULT_STALLED_MINUTES})
 * whenever the flag is absent or its value isn't a positive integer — a
 * malformed flag should degrade to the default, never crash a watchdog
 * check. `main()` passes `emet.config.json`'s `usage.stalledMinutes` here;
 * the parameter default only matters for a direct call with no config in
 * scope (e.g. this file's own tests).
 */
export function parseStalledMinutes(
  cliArguments: string[],
  defaultMinutes: number = DEFAULT_STALLED_MINUTES,
): number {
  return parseFlagMinutes(cliArguments, "--minutes", defaultMinutes);
}

function parseFlagMinutes(cliArguments: string[], flag: string, defaultMinutes: number): number {
  const index = cliArguments.indexOf(flag);
  if (index === -1) {
    return defaultMinutes;
  }
  const raw = cliArguments[index + 1];
  const parsed = raw ? Math.trunc(Number(raw)) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMinutes;
}

export function taskIdFromTranscriptPath(path: string): string {
  return path.split("/").pop()!.replace(".jsonl", "");
}

function isStalled(mtimeMs: number, nowMs: number, staleMinutes: number): boolean {
  return nowMs - mtimeMs > staleMinutes * 60_000;
}

function messageBlocks(event: unknown): { role: string; blocks: unknown[] } | null {
  if (!isObject(event)) {
    return null;
  }
  const record = event;
  if (record.type !== "assistant" && record.type !== "user") {
    return null;
  }
  const message = record.message;
  if (!isObject(message)) {
    return null;
  }
  const content = message.content;
  return { role: record.type, blocks: Array.isArray(content) ? content : [] };
}

/**
 * Describes the last user/assistant event of a transcript's raw JSONL. A
 * final assistant event carrying `tool_use` blocks is a pending call: nothing
 * after it can have answered it, so no `tool_result` match is needed.
 */
export function describeLastStep(transcriptText: string): LastTranscriptStep {
  const lines = transcriptText.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!.trim();
    if (!line) {
      continue;
    }
    let parsed: ReturnType<typeof messageBlocks> = null;
    try {
      parsed = messageBlocks(JSON.parse(line));
    } catch {
      continue;
    }
    if (!parsed) {
      continue;
    }
    const toolNames = parsed.blocks.flatMap((block) => {
      const record: Record<string, unknown> = isObject(block) ? block : {};
      return record.type === "tool_use"
        ? [typeof record.name === "string" ? record.name : "unknown"]
        : [];
    });
    if (parsed.role === "assistant" && toolNames.length > 0) {
      const pendingTool = toolNames.join(", ");
      return { step: `tool_use ${pendingTool}`, pendingTool };
    }
    const hasToolResult = parsed.blocks.some(
      (block) => isObject(block) && block.type === "tool_result",
    );
    const step = hasToolResult ? "tool_result" : `${parsed.role} message`;
    return { step, pendingTool: null };
  }
  return UNKNOWN_STEP;
}

async function defaultReadLastStep(path: string): Promise<LastTranscriptStep> {
  return describeLastStep(await Bun.file(path).text());
}

async function defaultStatMtimeMs(path: string): Promise<number | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  const stat = await file.stat();
  return stat.mtimeMs;
}

/**
 * Checks each transcript's own mtime against `nowMs`, reporting every one
 * silent for longer than `thresholds.idleMinutes`, or
 * `thresholds.pendingToolMinutes` when the last event is an unanswered
 * `tool_use` (a long test run is not a hang). A path that no longer exists (e.g.
 * a worktree already reclaimed by `emet:cleanup`) is skipped rather than
 * reported — same "unverifiable candidate is dropped, not assumed guilty"
 * rule {@link countOversizedReads} already follows.
 */
export async function findStalledTranscripts(
  paths: string[],
  nowMs: number,
  thresholds: StalledThresholds,
  statMtimeMs: (path: string) => Promise<number | null> = defaultStatMtimeMs,
  readLastStep: (path: string) => Promise<LastTranscriptStep> = defaultReadLastStep,
): Promise<StalledTranscript[]> {
  const stalled: StalledTranscript[] = [];
  for (const path of paths) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const mtimeMs = await statMtimeMs(path);
    if (mtimeMs === null) {
      continue;
    }
    if (!isStalled(mtimeMs, nowMs, thresholds.idleMinutes)) {
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const last = await readLastStep(path);
    const limit = last.pendingTool
      ? Math.max(thresholds.pendingToolMinutes, thresholds.idleMinutes)
      : thresholds.idleMinutes;
    if (isStalled(mtimeMs, nowMs, limit)) {
      stalled.push({
        taskId: taskIdFromTranscriptPath(path),
        path,
        minutesSinceLastWrite: Math.floor((nowMs - mtimeMs) / 60_000),
        lastStep: last.step,
        pendingTool: last.pendingTool,
      });
    }
  }
  return stalled;
}

export type TicketStallState =
  | "completed"
  | "stopped-without-commits"
  | "probe-unavailable"
  | "stalled"
  | "working";

/**
 * Decides one ticket's state from its completion event and a branch-commit
 * probe — never from transcript prose. `commits === null` means the probe
 * could not run, which is reported as its own state rather than collapsed
 * into "no commits". A `blocked` stop is the hook sending the worker back to
 * work, so it counts as no event.
 */
export function classifyTicketStall(input: {
  readonly event: CompletionEvent | null;
  readonly commits: number | null;
  readonly lastActivityMs: number;
  readonly nowMs: number;
  readonly idleMinutes: number;
}): TicketStallState {
  if (input.commits === null) return "probe-unavailable";
  if (input.event?.outcome === "allowed") {
    return input.commits > 0 ? "completed" : "stopped-without-commits";
  }
  return isStalled(input.lastActivityMs, input.nowMs, input.idleMinutes) ? "stalled" : "working";
}

async function worktreeStartCommit(worktreeDirectory: string): Promise<string | null> {
  const result = await Bun.$`git -C ${worktreeDirectory} reflog show HEAD --format=%H`
    .nothrow()
    .quiet();
  if (result.exitCode !== 0) return null;
  const lines = result.stdout.toString().trim().split("\n").filter(Boolean);
  return lines.at(-1) ?? null;
}

async function probeBranchCommits(
  commonDirectory: string,
  branch: string,
  worktreeDirectory: string,
): Promise<number | null> {
  const start = await worktreeStartCommit(worktreeDirectory);
  if (start !== null) {
    const result = await Bun.$`git -C ${commonDirectory} rev-list --count ${start}..${branch}`
      .nothrow()
      .quiet();
    const count = Number(result.stdout.toString().trim());
    if (result.exitCode === 0 && Number.isSafeInteger(count)) return count;
  }
  for (const base of ["origin/HEAD", "origin/main", "main", "origin/master", "master"]) {
    const result =
      // oxlint-disable-next-line eslint/no-await-in-loop -- git and gh calls stay sequential to keep output and side effects ordered
      await Bun.$`git -C ${commonDirectory} rev-list --count ${base}..${branch}`.nothrow().quiet();
    if (result.exitCode === 0) {
      const count = Number(result.stdout.toString().trim());
      if (Number.isSafeInteger(count)) return count;
    }
  }
  return null;
}

async function lastCommitMs(commonDirectory: string, branch: string): Promise<number> {
  const result = await Bun.$`git -C ${commonDirectory} log -1 --format=%ct ${branch}`
    .nothrow()
    .quiet();
  const seconds = Number(result.stdout.toString().trim());
  return result.exitCode === 0 && Number.isFinite(seconds) ? seconds * 1000 : 0;
}

/**
 * `--stalled --run <runId>`: one line per emet-owned worktree of that run,
 * from its completion event plus branch commits. With `--nudge`, each
 * stalled ticket spends one persisted nudge (`budgets.stallNudgeCap`, never
 * refilled); an exhausted cap is reported so the caller escalates instead.
 * Last activity is the newest of the last branch commit and the worktree's
 * handoff note.
 */
async function runTicketStalledMode(
  runId: string,
  idleMinutes: number,
  nudgeCap: number,
  spendNudges: boolean,
): Promise<void> {
  const commonDirectoryOutput = await Bun.$`git rev-parse --path-format=absolute --git-common-dir`
    .nothrow()
    .quiet();
  if (commonDirectoryOutput.exitCode !== 0) {
    console.error(`${BINARY}:usage --stalled --run: not inside a git repository`);
    process.exitCode = 1;
    return;
  }
  const commonDirectory = commonDirectoryOutput.stdout.toString().trim();
  const entries = parseWorktreeEntries(await Bun.$`git worktree list --porcelain`.text());
  let attention = 0;
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry);
    if (!owner || owner.runId !== runId) continue;
    const branch = entry.branch?.replace(/^refs\/heads\//, "") ?? null;
    const commitsProbe = branch
      ? probeBranchCommits(commonDirectory, branch, entry.directory)
      : Promise.resolve(null);
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const commits = await commitsProbe;
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const handoffTimes = await Promise.all(
      [RUN_DIR, LEGACY_RUN_DIR].map((runDirectory) =>
        defaultStatMtimeMs(`${entry.directory}/${runDirectory}/handoff-${owner.ticket}.md`),
      ),
    );
    const handoff = handoffTimes.reduce<number | null>(
      (latest, time) => (time === null ? latest : Math.max(latest ?? 0, time)),
      null,
    );
    const lastActivityMs = Math.max(
      handoff ?? 0,
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      branch ? await lastCommitMs(commonDirectory, branch) : 0,
      Date.parse(owner.at) || 0,
    );
    const state = classifyTicketStall({
      event: readCompletionEvent(commonDirectory, runId, owner.ticket),
      commits,
      lastActivityMs,
      nowMs: Date.now(),
      idleMinutes,
    });
    let suffix = "";
    if (state === "stalled" && spendNudges) {
      const nudge = recordStallNudge(commonDirectory, runId, owner.ticket, nudgeCap);
      suffix = nudge.granted
        ? `  nudge ${nudge.count}/${nudge.cap} spent`
        : `  nudge cap ${nudge.cap} exhausted — escalate, do not nudge again`;
    }
    if (state === "stalled" || state === "probe-unavailable") attention++;
    console.log(`${owner.ticket}  ${state}  commits=${commits ?? "unavailable"}${suffix}`);
  }
  if (attention > 0) process.exitCode = 1;
}

/**
 * `--stalled` mode: resolves the same coordinator session + worker-
 * transcript set the default report uses, then reports which ones have gone
 * silent past `staleMinutes`. Exits with code 1 when any are found, so a
 * coordinator can branch on it directly instead of parsing stdout.
 */
async function runStalledMode(thresholds: StalledThresholds): Promise<void> {
  const cliArguments = process.argv.slice(2);
  const sessionFlagIndex = cliArguments.indexOf("--session");
  const directory = projectsDirectory(cliArguments);
  const sessionId = sessionFlagIndex === -1 ? null : (cliArguments[sessionFlagIndex + 1] ?? null);

  const sessionFile = sessionId
    ? `${directory}/${sessionId}.jsonl`
    : await findMostRecentSessionFile(directory);

  if (!sessionFile) {
    console.error(`no session transcripts found under ${directory}`);
    process.exitCode = 1;
    return;
  }

  const resolvedSessionId = sessionId ?? sessionFile.split("/").pop()!.replace(".jsonl", "");

  const workerFiles = await findWorkerTranscripts(directory, resolvedSessionId);
  if (workerFiles.length === 0) {
    console.log(
      `${BINARY}:usage --stalled: no subagent transcripts found for session ${resolvedSessionId}.`,
    );
    return;
  }

  const stalled = await findStalledTranscripts(workerFiles, Date.now(), thresholds);

  if (stalled.length === 0) {
    console.log(
      `${BINARY}:usage --stalled OK — ${workerFiles.length} subagent transcript(s) checked, none stalled past ${thresholds.idleMinutes}m idle (${thresholds.pendingToolMinutes}m with a pending tool).`,
    );
    return;
  }

  console.log(
    `${BINARY}:usage --stalled: ${stalled.length}/${workerFiles.length} subagent(s) stalled (${thresholds.idleMinutes}m idle, ${thresholds.pendingToolMinutes}m with a pending tool):`,
  );
  for (const entry of stalled) {
    console.log(
      `  ${entry.taskId}  (${entry.minutesSinceLastWrite}m since last write)  last step: ${entry.lastStep}${entry.pendingTool ? `  pending tool: ${entry.pendingTool}` : ""}  ${entry.path}`,
    );
  }
  process.exitCode = 1;
}

async function main(config: ForgeConfig): Promise<void> {
  const cliArguments = process.argv.slice(2);
  const oversizedThreshold = config.usage.oversizedReadLines;

  if (cliArguments.includes("--stalled")) {
    const runFlagIndex = cliArguments.indexOf("--run");
    const runId = runFlagIndex === -1 ? null : (cliArguments[runFlagIndex + 1] ?? null);
    if (runId) {
      await runTicketStalledMode(
        runId,
        parseStalledMinutes(cliArguments, config.usage.stalledMinutes),
        config.budgets.stallNudgeCap,
        cliArguments.includes("--nudge"),
      );
      return;
    }
    await runStalledMode({
      idleMinutes: parseStalledMinutes(cliArguments, config.usage.stalledMinutes),
      pendingToolMinutes: parseFlagMinutes(
        cliArguments,
        "--tool-minutes",
        DEFAULT_PENDING_TOOL_MINUTES,
      ),
    });
    return;
  }

  const fileFlagIndex = cliArguments.indexOf("--file");
  const sessionFlagIndex = cliArguments.indexOf("--session");

  if (fileFlagIndex !== -1) {
    const path = cliArguments[fileFlagIndex + 1];
    if (!path) {
      console.error("--file requires a path");
      process.exitCode = 1;
      return;
    }
    const stats = await analyzeTranscript(path, path, oversizedThreshold);
    if (!stats) {
      console.error(`no usage data found in ${path}`);
      process.exitCode = 1;
      return;
    }
    printStats(stats, oversizedThreshold);
    return;
  }

  const directory = projectsDirectory(cliArguments);
  const sessionId = sessionFlagIndex === -1 ? null : (cliArguments[sessionFlagIndex + 1] ?? null);

  const sessionFile = sessionId
    ? `${directory}/${sessionId}.jsonl`
    : await findMostRecentSessionFile(directory);

  if (!sessionFile) {
    console.error(`no session transcripts found under ${directory}`);
    process.exitCode = 1;
    return;
  }

  const resolvedSessionId = sessionId ?? sessionFile.split("/").pop()!.replace(".jsonl", "");

  const coordinatorStats = await analyzeTranscript(
    sessionFile,
    `coordinator ${resolvedSessionId}`,
    oversizedThreshold,
  );
  if (coordinatorStats) {
    printStats(coordinatorStats, oversizedThreshold);
  }

  const workerFiles = await findWorkerTranscripts(directory, resolvedSessionId);
  let totalWorkerCacheReadMillion = 0;
  for (const workerFile of workerFiles) {
    const label = workerFile.split("/").pop()!.replace(".jsonl", "");
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const stats = await analyzeTranscript(workerFile, `worker ${label}`, oversizedThreshold);
    if (stats) {
      printStats(stats, oversizedThreshold);
      totalWorkerCacheReadMillion += stats.cacheReadMillionTokens;
    }
  }

  console.log(
    `\n=== total ===\nworkers: ${workerFiles.length}\nworker cache_read (M tok): ${totalWorkerCacheReadMillion.toFixed(2)}`,
  );
}

/**
 * Entry point invoked by the `emet` CLI dispatcher (`bin/emet.ts`) for the
 * `usage` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 * `usage` is read-only (never touches git or Linear state, see the
 * file-level doc comment), so a missing `emet.config.json` degrades to
 * {@link DEFAULT_FORGE_CONFIG} with a printed note rather than exiting 2.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    const { config, note } = repoRoot
      ? await loadForgeConfigWithDefaults(repoRoot)
      : { config: DEFAULT_FORGE_CONFIG, note: undefined };
    if (note) console.error(note);
    await main(config);
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

/** Returns `value` when it is a number, otherwise `0`. */
function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
