import { describe, expect, test } from 'bun:test'

import {
  aggregateRun,
  costUsd,
  formatMetricsSummary,
  parseTranscriptMetrics,
  type TicketMetrics,
} from './metrics'

function turn(timestamp: string, model: string, usage: Record<string, number>): string {
  return JSON.stringify({ type: 'assistant', timestamp, message: { model, usage } })
}

describe('parseTranscriptMetrics', () => {
  const text = [
    turn('2026-01-01T00:00:00Z', 'claude-sonnet-5', {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 200,
    }),
    'not json',
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:01:00Z', message: { content: [] } }),
    turn('2026-01-01T00:02:00Z', 'claude-sonnet-5', {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 2000,
    }),
  ].join('\n')

  test('sums tokens, finds peak context and wall time', () => {
    const metrics = parseTranscriptMetrics(text)
    expect(metrics.turns).toBe(2)
    expect(metrics.inputTokens).toBe(110)
    expect(metrics.outputTokens).toBe(55)
    expect(metrics.cacheReadTokens).toBe(3000)
    expect(metrics.cacheCreationTokens).toBe(200)
    expect(metrics.peakContext).toBe(2010)
    expect(metrics.wallMs).toBe(120_000)
    expect(metrics.models).toEqual(['claude-sonnet-5'])
  })

  test('prices per model family with cache multipliers', () => {
    const tokens = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheCreationTokens: 1e6 }
    expect(costUsd('claude-opus-4', tokens)).toBeCloseTo(5 + 25 + 0.5 + 6.25)
    expect(costUsd('claude-haiku-4', tokens)).toBeCloseTo(1 + 5 + 0.1 + 1.25)
    expect(costUsd('mystery', tokens)).toBeCloseTo(3 + 15 + 0.3 + 3.75)
    expect(parseTranscriptMetrics(text).costUsd).toBeGreaterThan(0)
  })

  test('an empty transcript yields zeros', () => {
    const metrics = parseTranscriptMetrics('')
    expect(metrics.turns).toBe(0)
    expect(metrics.wallMs).toBe(0)
  })
})

function ticket(id: string, wave: number, wallMs: number, peak: number, estimate: number | null): TicketMetrics {
  return {
    ticket: id,
    wave,
    estimatedPeakTokens: estimate,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 100,
    cacheCreationTokens: 0,
    turns: 3,
    peakContext: peak,
    costUsd: 1.5,
    wallMs,
    models: [],
  }
}

describe('aggregateRun', () => {
  const tickets = [
    ticket('A', 1, 60_000, 30_000, 40_000),
    ticket('B', 1, 90_000, 50_000, 40_000),
    ticket('C', 2, 30_000, 20_000, null),
  ]

  test('sums tokens and cost; wave wall is the slowest ticket, run wall the sum of waves', () => {
    const metrics = aggregateRun('r1', tickets)
    expect(metrics.run.costUsd).toBeCloseTo(4.5)
    expect(metrics.run.cacheReadTokens).toBe(300)
    expect(metrics.waves.get(1)!.wallMs).toBe(90_000)
    expect(metrics.waves.get(1)!.costUsd).toBeCloseTo(3)
    expect(metrics.run.wallMs).toBe(120_000)
  })

  test('summary flags over-budget tickets and missing estimates', () => {
    const summary = formatMetricsSummary(aggregateRun('r1', tickets))
    expect(summary).toContain('## Metrics — run r1')
    expect(summary).toContain('Wave 2:')
    expect(summary).toMatch(/\| B \| 1 .*\(OVER\)/)
    expect(summary).toMatch(/\| A \| 1 .*\(within\)/)
    expect(summary).toMatch(/\| C \| 2 .*\(no estimate\)/)
  })
})
