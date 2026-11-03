/**
 * `forge metrics --run <id>`: tokens, API-equivalent dollars and wall time per
 * ticket, wave and run, read from Claude Code transcripts (JSONL), plus the
 * ticket's estimated context budget against its actual peak context. Read-only.
 * The usage fields read here are the same ones `usage.ts` reads.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveRepoRoot } from './config'
import { readCompletionEvent } from './runs'

const USAGE = `usage: forge metrics --run <id> [--root <dir>] [--json]`

export type TokenTotals = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheCreationTokens: number
}

export type TranscriptMetrics = TokenTotals & {
  readonly turns: number
  readonly peakContext: number
  readonly costUsd: number
  readonly wallMs: number
  readonly models: readonly string[]
}

type Rates = { readonly input: number; readonly output: number; readonly cacheRead?: number }

/**
 * USD per million tokens, first-party API rates (claude-api skill, cached 2026-10-06).
 * Cache creation is 1.25x input; cache read defaults to 0.1x input unless `cacheRead` is set.
 * Entries are matched in order, so the specific Claude 5 ids come before the family fallbacks.
 */
const RATES_BY_MODEL_MARKER: readonly (readonly [string, Rates])[] = [
  ['fable', { input: 10, output: 50, cacheRead: 0.25 }],
  ['opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['haiku-5', { input: 0.1, output: 0.5 }],
  ['opus', { input: 5, output: 25 }],
  ['sonnet', { input: 3, output: 15 }],
  ['haiku', { input: 1, output: 5 }],
]

const FALLBACK_RATES: Rates = { input: 3, output: 15 }

function ratesForModel(model: string): Rates {
  return RATES_BY_MODEL_MARKER.find(([marker]) => model.includes(marker))?.[1] ?? FALLBACK_RATES
}

export function costUsd(model: string, tokens: TokenTotals): number {
  const rates = ratesForModel(model)
  const cacheReadRate = rates.cacheRead ?? rates.input * 0.1
  return (
    (tokens.inputTokens * rates.input +
      tokens.cacheReadTokens * cacheReadRate +
      tokens.cacheCreationTokens * rates.input * 1.25 +
      tokens.outputTokens * rates.output) /
    1e6
  )
}

function numberOr0(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function parseTranscriptMetrics(text: string): TranscriptMetrics {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0
  let turns = 0
  let peakContext = 0
  let cost = 0
  let firstMs = Number.POSITIVE_INFINITY
  let lastMs = Number.NEGATIVE_INFINITY
  const models = new Set<string>()

  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof event !== 'object' || event === null) continue
    const record = event as Record<string, unknown>

    const stamp = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN
    if (Number.isFinite(stamp)) {
      firstMs = Math.min(firstMs, stamp)
      lastMs = Math.max(lastMs, stamp)
    }

    const message = record.message
    if (typeof message !== 'object' || message === null) continue
    const usage = (message as Record<string, unknown>).usage
    if (typeof usage !== 'object' || usage === null) continue
    const fields = usage as Record<string, unknown>
    if (typeof fields.input_tokens !== 'number') continue

    const turn: TokenTotals = {
      inputTokens: fields.input_tokens,
      outputTokens: numberOr0(fields.output_tokens),
      cacheReadTokens: numberOr0(fields.cache_read_input_tokens),
      cacheCreationTokens: numberOr0(fields.cache_creation_input_tokens),
    }
    const model = (message as Record<string, unknown>).model
    const modelName = typeof model === 'string' ? model : ''
    if (modelName) models.add(modelName)

    turns += 1
    inputTokens += turn.inputTokens
    outputTokens += turn.outputTokens
    cacheReadTokens += turn.cacheReadTokens
    cacheCreationTokens += turn.cacheCreationTokens
    peakContext = Math.max(peakContext, turn.inputTokens + turn.cacheReadTokens + turn.cacheCreationTokens)
    cost += costUsd(modelName, turn)
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    turns,
    peakContext,
    costUsd: cost,
    wallMs: Number.isFinite(firstMs) ? lastMs - firstMs : 0,
    models: [...models].toSorted(),
  }
}

export type TicketMetrics = TranscriptMetrics & {
  readonly ticket: string
  readonly wave: number
  readonly estimatedPeakTokens: number | null
}

export type GroupMetrics = TokenTotals & {
  readonly costUsd: number
  readonly wallMs: number
  readonly turns: number
}

export type RunMetrics = {
  readonly runId: string
  readonly tickets: readonly TicketMetrics[]
  readonly waves: ReadonlyMap<number, GroupMetrics>
  readonly run: GroupMetrics
}

function sumGroup(members: readonly TranscriptMetrics[]): GroupMetrics {
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, wallMs: 0, turns: 0 }
  for (const member of members) {
    total.inputTokens += member.inputTokens
    total.outputTokens += member.outputTokens
    total.cacheReadTokens += member.cacheReadTokens
    total.cacheCreationTokens += member.cacheCreationTokens
    total.costUsd += member.costUsd
    total.wallMs += member.wallMs
    total.turns += member.turns
  }
  return total
}

/** Waves run in sequence, so a wave's wall time is its slowest ticket and the run's is the sum of waves. */
export function aggregateRun(runId: string, tickets: readonly TicketMetrics[]): RunMetrics {
  const byWave = new Map<number, TicketMetrics[]>()
  for (const ticket of tickets) byWave.set(ticket.wave, [...(byWave.get(ticket.wave) ?? []), ticket])
  const waves = new Map<number, GroupMetrics>()
  for (const wave of [...byWave.keys()].toSorted((a, b) => a - b)) {
    const members = byWave.get(wave)!
    waves.set(wave, { ...sumGroup(members), wallMs: Math.max(...members.map((member) => member.wallMs)) })
  }
  const run = sumGroup(tickets)
  return { runId, tickets, waves, run: { ...run, wallMs: [...waves.values()].reduce((sum, wave) => sum + wave.wallMs, 0) } }
}

function formatTokens(tokens: number): string {
  return tokens >= 1e6 ? `${(tokens / 1e6).toFixed(2)}M` : `${(tokens / 1e3).toFixed(1)}K`
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  return minutes > 0 ? `${minutes}m${String(totalSeconds % 60).padStart(2, '0')}s` : `${totalSeconds}s`
}

function totalTokens(group: TokenTotals): number {
  return group.inputTokens + group.outputTokens + group.cacheReadTokens + group.cacheCreationTokens
}

function groupLine(label: string, group: GroupMetrics): string {
  return `${label}: ${formatTokens(totalTokens(group))} tokens, $${group.costUsd.toFixed(2)} API-equivalent, ${formatDuration(group.wallMs)} wall`
}

function budgetCell(ticket: TicketMetrics): string {
  const actual = formatTokens(ticket.peakContext)
  if (ticket.estimatedPeakTokens === null) return `peak ${actual} (no estimate)`
  const verdict = ticket.peakContext > ticket.estimatedPeakTokens ? 'OVER' : 'within'
  return `peak ${actual} vs est ${formatTokens(ticket.estimatedPeakTokens)} (${verdict})`
}

/** Markdown block the Phase 9 final report appends. */
export function formatMetricsSummary(metrics: RunMetrics): string {
  const lines = [`## Metrics — run ${metrics.runId}`, '', `- ${groupLine('Run', metrics.run)}`]
  for (const [wave, group] of metrics.waves) lines.push(`- ${groupLine(`Wave ${wave}`, group)}`)
  lines.push('', '| Ticket | Wave | Tokens | $ | Wall | Context budget |', '| --- | --- | --- | --- | --- | --- |')
  for (const ticket of metrics.tickets) {
    lines.push(
      `| ${ticket.ticket} | ${ticket.wave} | ${formatTokens(totalTokens(ticket))} | $${ticket.costUsd.toFixed(2)} | ${formatDuration(ticket.wallMs)} | ${budgetCell(ticket)} |`,
    )
  }
  return lines.join('\n')
}

type PlanEntry = { readonly id: string; readonly wave: number; readonly estimatedPeakTokens: number | null }

export function readPlanEntries(ticketsPath: string): PlanEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(ticketsPath, 'utf8'))
  const list = Array.isArray(parsed) ? parsed : (parsed as { tickets?: unknown }).tickets
  if (!Array.isArray(list)) throw new Error(`${ticketsPath}: expected a tickets array`)
  return list.flatMap((entry: unknown) => {
    const candidate = entry as Record<string, unknown>
    if (typeof candidate?.id !== 'string') return []
    return [
      {
        id: candidate.id,
        wave: typeof candidate.wave === 'number' ? candidate.wave : 1,
        estimatedPeakTokens:
          typeof candidate.estimatedPeakTokens === 'number' ? candidate.estimatedPeakTokens : null,
      },
    ]
  })
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

export async function run(argv: string[]): Promise<void> {
  const runId = readFlag(argv, '--run') ?? argv.find((argument) => !argument.startsWith('--'))
  if (!runId || /[\\/]|^\.\.?$/.test(runId)) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const root = readFlag(argv, '--root') ?? (await resolveRepoRoot()) ?? process.cwd()
  const commonDirectoryOutput =
    await Bun.$`git -C ${root} rev-parse --path-format=absolute --git-common-dir`.nothrow().quiet()
  const commonDirectory =
    commonDirectoryOutput.exitCode === 0 ? commonDirectoryOutput.stdout.toString().trim() : root
  const ticketsPath = [
    path.join(commonDirectory, '.forge', 'runs', runId, 'tickets.json'),
    path.join(root, '.forge', 'runs', runId, 'tickets.json'),
  ].find((candidate) => existsSync(candidate)) ?? path.join(root, '.forge', 'runs', runId, 'tickets.json')
  if (!existsSync(ticketsPath)) {
    console.error(`forge metrics: no tickets.json at ${ticketsPath}`)
    process.exitCode = 1
    return
  }

  const tickets: TicketMetrics[] = []
  const missing: string[] = []
  for (const entry of readPlanEntries(ticketsPath)) {
    const event = readCompletionEvent(commonDirectory, runId, entry.id)
    const transcript =
      event?.agentTranscriptPath && existsSync(event.agentTranscriptPath)
        ? event.agentTranscriptPath
        : null
    if (!transcript) {
      missing.push(entry.id)
      continue
    }
    tickets.push({
      ...parseTranscriptMetrics(readFileSync(transcript, 'utf8')),
      ticket: entry.id,
      wave: entry.wave,
      estimatedPeakTokens: entry.estimatedPeakTokens,
    })
  }
  const metrics = aggregateRun(runId, tickets)
  console.log(
    argv.includes('--json')
      ? JSON.stringify({ ...metrics, waves: Object.fromEntries(metrics.waves), missing })
      : formatMetricsSummary(metrics),
  )
  if (missing.length > 0) console.error(`forge metrics: no transcript found for ${missing.join(', ')}`)
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
