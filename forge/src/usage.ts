/**
 * Read-only token-usage report for a `/forge` run. Reads Claude Code
 * transcripts directly (JSONL, one line per event) and prints, per session:
 * turn count, total `cache_read_input_tokens` (the dominant cost term),
 * final context size, the top-10 largest tool results (the usual culprits:
 * unfiltered test output, full-file `Read`s, screenshots), and how many
 * `Read` calls went unbounded (no `offset`/`limit`) against a file over
 * ~400 lines — the locate-before-`Read` discipline `reference/worker-prompt.md` and `reference/phases-6-9.md` (Phase 7 step 3) spell out as "Context budget and output
 * hygiene" tripwire that a prose-only instruction measurably failed to
 * prevent in a real 4-worker wave.
 *
 * Never touches Linear, git state, or anything mutable — safe to run at any
 * point, including mid-wave, to sanity-check a worker or the coordinator
 * itself against the plan's targets (peak < 160k, split threshold 240k).
 *
 * Usage:
 *   forge usage                      # most recent coordinator session + its workers
 *   forge usage --session <id>        # a specific coordinator session
 *   forge usage --file <path.jsonl>   # a single transcript file directly
 *   forge usage --stalled [--minutes N]  # find hung subagents (default 10m)
 *
 * `--stalled` is the watchdog for a coordinator's own `code-review` fan-out
 * (`docs/agents/forge.md` Phase 8): a sub-agent transcript is a plain file
 * that only grows while its process is actually producing output, so a
 * transcript whose mtime hasn't advanced in N minutes names a hung roster
 * member without needing to inspect the harness's own process/task state at
 * all — the same signal `findWorkerTranscripts` already reads for the
 * default report, just checked for silence instead of summarized.
 */

import os from 'node:os'

import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type ForgeConfig,
} from './config'

type UsageEntry = {
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheCreationTokens: number
}

type ToolResultSample = {
  readonly name: string
  readonly chars: number
}

type TranscriptStats = {
  readonly label: string
  readonly turns: number
  readonly cacheReadMillionTokens: number
  readonly floorContext: number
  readonly peakContext: number
  readonly finalContext: number
  readonly compactBoundaries: number
  readonly topToolResults: ToolResultSample[]
  readonly oversizedFullReads: number
}

function contextSize(entry: UsageEntry): number {
  return entry.inputTokens + entry.cacheReadTokens + entry.cacheCreationTokens
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
    if (typeof block !== 'object' || block === null) {
      continue
    }
    const blockRecord = block as Record<string, unknown>
    if (blockRecord.type === 'tool_use' && typeof blockRecord.id === 'string') {
      const name =
        typeof blockRecord.name === 'string' ? blockRecord.name : 'unknown'
      toolNameById.set(blockRecord.id, name)
      if (name === 'Read') {
        const input = blockRecord.input as Record<string, unknown> | undefined
        const filePath =
          input && typeof input.file_path === 'string'
            ? input.file_path
            : undefined
        const isBounded = Boolean(
          input && ('offset' in input || 'limit' in input),
        )
        if (filePath && !isBounded) {
          unboundedReadPaths.push(filePath)
        }
      }
    }
    if (
      blockRecord.type === 'tool_result' &&
      typeof blockRecord.tool_use_id === 'string'
    ) {
      resultSizeById.set(
        blockRecord.tool_use_id,
        toolResultCharCount(blockRecord.content),
      )
    }
  }
}

/**
 * Default `oversizedThreshold` (line count) below, historically hardcoded —
 * now sourced from `forge.config.json`'s `usage.oversizedReadLines`, this
 * constant survives only as the fallback when a caller doesn't pass one
 * explicitly.
 */
const OVERSIZED_READ_LINE_THRESHOLD = 400

/**
 * Counts how many of `paths` currently exceed `oversizedThreshold` lines. A
 * path from a cleaned-up worktree (deleted by `forge:cleanup`) silently
 * doesn't count — this is a best-effort signal computed after the fact, not
 * a guarantee, so an unverifiable candidate is dropped rather than assumed
 * guilty.
 */
async function countOversizedReads(
  paths: string[],
  oversizedThreshold: number = OVERSIZED_READ_LINE_THRESHOLD,
): Promise<number> {
  let count = 0
  for (const path of paths) {
    const file = Bun.file(path)
    if (!(await file.exists())) {
      continue
    }
    const text = await file.text()
    const lineCount = text.split('\n').length
    if (lineCount > oversizedThreshold) {
      count += 1
    }
  }
  return count
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
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return null
  }
  const text = await file.text()
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  const usageEntries: UsageEntry[] = []
  let compactBoundaries = 0
  const toolNameById = new Map<string, string>()
  const resultSizeById = new Map<string, number>()
  const unboundedReadPaths: string[] = []

  for (const line of lines) {
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof event !== 'object' || event === null) {
      continue
    }
    const record = event as Record<string, unknown>

    if (JSON.stringify(record).includes('compact_boundary')) {
      compactBoundaries += 1
    }

    const message = record.message as Record<string, unknown> | undefined
    if (!message) {
      continue
    }

    const usage = message.usage as Record<string, unknown> | undefined
    if (usage && typeof usage.input_tokens === 'number') {
      usageEntries.push({
        inputTokens: usage.input_tokens as number,
        cacheReadTokens: (usage.cache_read_input_tokens as number) ?? 0,
        cacheCreationTokens: (usage.cache_creation_input_tokens as number) ?? 0,
      })
    }

    const content = message.content
    if (!Array.isArray(content)) {
      continue
    }
    recordToolBlocks(content, toolNameById, resultSizeById, unboundedReadPaths)
  }

  if (usageEntries.length === 0) {
    return null
  }

  const topToolResults: ToolResultSample[] = [...resultSizeById]
    .map(([id, chars]) => ({
      name: toolNameById.get(id) ?? 'unknown',
      chars,
    }))
    .toSorted((a, b) => b.chars - a.chars)
    .slice(0, 10)

  let cacheReadTotal = 0

  for (const entry of usageEntries) {
    cacheReadTotal += entry.cacheReadTokens
  }
  const peakContext = Math.max(
    ...usageEntries.map((entry) => contextSize(entry)),
  )
  const oversizedFullReads = await countOversizedReads(
    unboundedReadPaths,
    oversizedThreshold,
  )

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
  }
}

function toolResultCharCount(content: unknown): number {
  if (typeof content === 'string') {
    return content.length
  }
  if (Array.isArray(content)) {
    let total = 0
    for (const part of content) {
      if (typeof part !== 'object' || part === null) {
        continue
      }

      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string') {
        total += text.length
      }
    }
    return total
  }
  return 0
}

function projectSlug(cwd: string): string {
  return cwd.replaceAll('/', '-')
}

/**
 * Resolves an explicit `--project-dir <path>` off `argv`, defaulting to
 * `process.cwd()`. Needed once `usage` is a subcommand of a global CLI: a
 * coordinator invoking `forge usage` from a worker's own worktree (a
 * different directory than the one that produced the transcript it wants to
 * read) has no other way to point this at the right project slug.
 */
function resolveProjectDirectoryFlag(argv: readonly string[]): string {
  const flagIndex = argv.indexOf('--project-dir')
  const value = flagIndex === -1 ? undefined : argv[flagIndex + 1]
  return value ?? process.cwd()
}

function projectsDirectory(argv: readonly string[] = []): string {
  const projectDirectory = resolveProjectDirectoryFlag(argv)
  return `${os.homedir()}/.claude/projects/${projectSlug(projectDirectory)}`
}

async function findMostRecentSessionFile(
  directory: string,
): Promise<string | null> {
  const glob = new Bun.Glob('*.jsonl')
  const entries = glob.scan({ cwd: directory, onlyFiles: true })
  let newest: { path: string; mtimeMs: number } | null = null
  for await (const entry of entries) {
    const path = `${directory}/${entry}`
    const stat = await Bun.file(path).stat()
    if (!newest || stat.mtimeMs > newest.mtimeMs) {
      newest = { path, mtimeMs: stat.mtimeMs }
    }
  }
  return newest?.path ?? null
}

async function findWorkerTranscripts(
  directory: string,
  sessionId: string,
): Promise<string[]> {
  const subagentsDirectory = `${directory}/${sessionId}/subagents`
  const glob = new Bun.Glob('agent-*.jsonl')
  const paths: string[] = []
  try {
    const entries = glob.scan({ cwd: subagentsDirectory, onlyFiles: true })
    for await (const entry of entries) {
      paths.push(`${subagentsDirectory}/${entry}`)
    }
  } catch {
    return []
  }
  return paths.toSorted((a, b) => a.localeCompare(b))
}

function printStats(
  stats: TranscriptStats,
  oversizedThreshold: number = OVERSIZED_READ_LINE_THRESHOLD,
): void {
  console.log(`\n=== ${stats.label} ===`)
  console.log(`turns:               ${stats.turns}`)
  console.log(`cache_read (M tok):  ${stats.cacheReadMillionTokens.toFixed(2)}`)
  console.log(`floor context:       ${stats.floorContext.toLocaleString()}`)
  console.log(`peak context:        ${stats.peakContext.toLocaleString()}`)
  console.log(`final context:       ${stats.finalContext.toLocaleString()}`)
  console.log(`compact boundaries:  ${stats.compactBoundaries}`)
  console.log(
    `oversized Read (>${oversizedThreshold} lines, unbounded): ${stats.oversizedFullReads}`,
  )
  if (stats.topToolResults.length > 0) {
    console.log('top tool results:')
    for (const result of stats.topToolResults) {
      console.log(`  ${(result.chars / 1024).toFixed(1)} KB  ${result.name}`)
    }
  }
}

const DEFAULT_STALLED_MINUTES = 10

export type StalledTranscript = {
  readonly taskId: string
  readonly path: string
  readonly minutesSinceLastWrite: number
}

/**
 * Reads a `--minutes N` value out of raw argv, falling back to
 * `defaultMinutes` (itself defaulting to {@link DEFAULT_STALLED_MINUTES})
 * whenever the flag is absent or its value isn't a positive integer — a
 * malformed flag should degrade to the default, never crash a watchdog
 * check. `main()` passes `forge.config.json`'s `usage.stalledMinutes` here;
 * the parameter default only matters for a direct call with no config in
 * scope (e.g. this file's own tests).
 */
export function parseStalledMinutes(
  arguments_: string[],
  defaultMinutes: number = DEFAULT_STALLED_MINUTES,
): number {
  const index = arguments_.indexOf('--minutes')
  if (index === -1) {
    return defaultMinutes
  }
  const raw = arguments_[index + 1]
  const parsed = raw ? Math.trunc(Number(raw)) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMinutes
}

export function taskIdFromTranscriptPath(path: string): string {
  return path.split('/').pop()!.replace('.jsonl', '')
}

function isStalled(
  mtimeMs: number,
  nowMs: number,
  staleMinutes: number,
): boolean {
  return nowMs - mtimeMs > staleMinutes * 60_000
}

async function defaultStatMtimeMs(path: string): Promise<number | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return null
  }
  const stat = await file.stat()
  return stat.mtimeMs
}

/**
 * Checks each transcript's own mtime against `nowMs`, reporting every one
 * silent for longer than `staleMinutes`. A path that no longer exists (e.g.
 * a worktree already reclaimed by `forge:cleanup`) is skipped rather than
 * reported — same "unverifiable candidate is dropped, not assumed guilty"
 * rule {@link countOversizedReads} already follows.
 */
export async function findStalledTranscripts(
  paths: string[],
  nowMs: number,
  staleMinutes: number,
  statMtimeMs: (path: string) => Promise<number | null> = defaultStatMtimeMs,
): Promise<StalledTranscript[]> {
  const stalled: StalledTranscript[] = []
  for (const path of paths) {
    const mtimeMs = await statMtimeMs(path)
    if (mtimeMs === null) {
      continue
    }
    if (isStalled(mtimeMs, nowMs, staleMinutes)) {
      stalled.push({
        taskId: taskIdFromTranscriptPath(path),
        path,
        minutesSinceLastWrite: Math.floor((nowMs - mtimeMs) / 60_000),
      })
    }
  }
  return stalled
}

/**
 * `--stalled` mode: resolves the same coordinator session + worker-
 * transcript set the default report uses, then reports which ones have gone
 * silent past `staleMinutes`. Exits with code 1 when any are found, so a
 * coordinator can branch on it directly instead of parsing stdout.
 */
async function runStalledMode(staleMinutes: number): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const sessionFlagIndex = arguments_.indexOf('--session')
  const directory = projectsDirectory(arguments_)
  const sessionId =
    sessionFlagIndex === -1 ? null : (arguments_[sessionFlagIndex + 1] ?? null)

  const sessionFile = sessionId
    ? `${directory}/${sessionId}.jsonl`
    : await findMostRecentSessionFile(directory)

  if (!sessionFile) {
    console.error(`no session transcripts found under ${directory}`)
    process.exitCode = 1
    return
  }

  const resolvedSessionId =
    sessionId ?? sessionFile.split('/').pop()!.replace('.jsonl', '')

  const workerFiles = await findWorkerTranscripts(directory, resolvedSessionId)
  if (workerFiles.length === 0) {
    console.log(
      `forge:usage --stalled: no subagent transcripts found for session ${resolvedSessionId}.`,
    )
    return
  }

  const stalled = await findStalledTranscripts(
    workerFiles,
    Date.now(),
    staleMinutes,
  )

  if (stalled.length === 0) {
    console.log(
      `forge:usage --stalled OK — ${workerFiles.length} subagent transcript(s) checked, none stalled past ${staleMinutes}m.`,
    )
    return
  }

  console.log(
    `forge:usage --stalled: ${stalled.length}/${workerFiles.length} subagent(s) stalled past ${staleMinutes}m:`,
  )
  for (const entry of stalled) {
    console.log(
      `  ${entry.taskId}  (${entry.minutesSinceLastWrite}m since last write)  ${entry.path}`,
    )
  }
  process.exitCode = 1
}

async function main(config: ForgeConfig): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const oversizedThreshold = config.usage.oversizedReadLines

  if (arguments_.includes('--stalled')) {
    await runStalledMode(
      parseStalledMinutes(arguments_, config.usage.stalledMinutes),
    )
    return
  }

  const fileFlagIndex = arguments_.indexOf('--file')
  const sessionFlagIndex = arguments_.indexOf('--session')

  if (fileFlagIndex !== -1) {
    const path = arguments_[fileFlagIndex + 1]
    if (!path) {
      console.error('--file requires a path')
      process.exitCode = 1
      return
    }
    const stats = await analyzeTranscript(path, path, oversizedThreshold)
    if (!stats) {
      console.error(`no usage data found in ${path}`)
      process.exitCode = 1
      return
    }
    printStats(stats, oversizedThreshold)
    return
  }

  const directory = projectsDirectory(arguments_)
  const sessionId =
    sessionFlagIndex === -1 ? null : (arguments_[sessionFlagIndex + 1] ?? null)

  const sessionFile = sessionId
    ? `${directory}/${sessionId}.jsonl`
    : await findMostRecentSessionFile(directory)

  if (!sessionFile) {
    console.error(`no session transcripts found under ${directory}`)
    process.exitCode = 1
    return
  }

  const resolvedSessionId =
    sessionId ?? sessionFile.split('/').pop()!.replace('.jsonl', '')

  const coordinatorStats = await analyzeTranscript(
    sessionFile,
    `coordinator ${resolvedSessionId}`,
    oversizedThreshold,
  )
  if (coordinatorStats) {
    printStats(coordinatorStats, oversizedThreshold)
  }

  const workerFiles = await findWorkerTranscripts(directory, resolvedSessionId)
  let totalWorkerCacheReadMillion = 0
  for (const workerFile of workerFiles) {
    const label = workerFile.split('/').pop()!.replace('.jsonl', '')
    const stats = await analyzeTranscript(
      workerFile,
      `worker ${label}`,
      oversizedThreshold,
    )
    if (stats) {
      printStats(stats, oversizedThreshold)
      totalWorkerCacheReadMillion += stats.cacheReadMillionTokens
    }
  }

  console.log(
    `\n=== total ===\nworkers: ${workerFiles.length}\nworker cache_read (M tok): ${totalWorkerCacheReadMillion.toFixed(2)}`,
  )
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `usage` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 * `usage` is read-only (never touches git or Linear state, see the
 * file-level doc comment), so a missing `forge.config.json` degrades to
 * {@link DEFAULT_FORGE_CONFIG} with a printed note rather than exiting 2.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv]
  try {
    const repoRoot = await resolveRepoRoot()
    const { config, note } = repoRoot
      ? await loadForgeConfigWithDefaults(repoRoot)
      : { config: DEFAULT_FORGE_CONFIG, note: undefined }
    if (note) console.error(note)
    await main(config)
  } catch (error: unknown) {
    console.error(error)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
