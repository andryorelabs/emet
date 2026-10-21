import { describe, expect, test } from 'bun:test'

import {
  describeLastStep,
  findStalledTranscripts,
  parseStalledMinutes,
  taskIdFromTranscriptPath,
} from './usage'

/**
 * Pure-function coverage only — `usage.ts` is read-only against real
 * Claude Code transcripts under `~/.claude/projects/`, and its `main()` is
 * guarded by `if (import.meta.main)` specifically so importing it here never
 * runs the CLI.
 */

describe('parseStalledMinutes', () => {
  test('defaults to 10 when --minutes is absent', () => {
    expect(parseStalledMinutes(['--stalled'])).toBe(10)
  })

  test('parses an explicit --minutes value', () => {
    expect(parseStalledMinutes(['--stalled', '--minutes', '5'])).toBe(5)
  })

  test('falls back to the default for a non-numeric value', () => {
    expect(parseStalledMinutes(['--minutes', 'soon'])).toBe(10)
  })

  test('falls back to the default for a zero or negative value', () => {
    expect(parseStalledMinutes(['--minutes', '0'])).toBe(10)
    expect(parseStalledMinutes(['--minutes', '-5'])).toBe(10)
  })

  test('falls back to the default when --minutes is the last argument', () => {
    expect(parseStalledMinutes(['--stalled', '--minutes'])).toBe(10)
  })
})

describe('taskIdFromTranscriptPath', () => {
  test('strips directory and extension, leaving the agent id', () => {
    expect(
      taskIdFromTranscriptPath(
        '/home/u/.claude/projects/slug/session/subagents/agent-a16d2afab2fe2f232.jsonl',
      ),
    ).toBe('agent-a16d2afab2fe2f232')
  })
})

describe('findStalledTranscripts', () => {
  const NOW = 1_000_000_000
  const THRESHOLDS = { idleMinutes: 10, pendingToolMinutes: 30 }
  const noPendingTool = () => Promise.resolve({ step: 'assistant message', pendingTool: null })

  test('reports a transcript silent past the threshold', async () => {
    const staleMtimeMs = NOW - 15 * 60_000
    const result = await findStalledTranscripts(
      ['agent-stale.jsonl'],
      NOW,
      THRESHOLDS,
      () => Promise.resolve(staleMtimeMs),
      noPendingTool,
    )
    expect(result).toEqual([
      {
        taskId: 'agent-stale',
        path: 'agent-stale.jsonl',
        minutesSinceLastWrite: 15,
        lastStep: 'assistant message',
        pendingTool: null,
      },
    ])
  })

  test('does not report a transcript that wrote recently', async () => {
    const freshMtimeMs = NOW - 2 * 60_000
    const result = await findStalledTranscripts(
      ['agent-fresh.jsonl'],
      NOW,
      THRESHOLDS,
      () => Promise.resolve(freshMtimeMs),
    )
    expect(result).toEqual([])
  })

  test('a transcript exactly at the threshold is not yet stalled', async () => {
    const exactMtimeMs = NOW - 10 * 60_000
    const result = await findStalledTranscripts(
      ['agent-exact.jsonl'],
      NOW,
      THRESHOLDS,
      () => Promise.resolve(exactMtimeMs),
    )
    expect(result).toEqual([])
  })

  test('a path whose file no longer exists is skipped, not reported', async () => {
    const result = await findStalledTranscripts(
      ['agent-gone.jsonl'],
      NOW,
      THRESHOLDS,
      () => Promise.resolve(null),
    )
    expect(result).toEqual([])
  })

  test('checks multiple paths independently', async () => {
    const mtimes: Record<string, number> = {
      'agent-a.jsonl': NOW - 20 * 60_000,
      'agent-b.jsonl': NOW - 1 * 60_000,
    }
    const result = await findStalledTranscripts(
      ['agent-a.jsonl', 'agent-b.jsonl'],
      NOW,
      THRESHOLDS,
      (path) => Promise.resolve(mtimes[path] ?? null),
      noPendingTool,
    )
    expect(result).toEqual([
      {
        taskId: 'agent-a',
        path: 'agent-a.jsonl',
        minutesSinceLastWrite: 20,
        lastStep: 'assistant message',
        pendingTool: null,
      },
    ])
  })
})

describe('describeLastStep', () => {
  const toolUse = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash' }] },
  })
  const toolResult = JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
  })

  test('a trailing tool_use is a pending tool', () => {
    expect(describeLastStep(`${toolResult}\n${toolUse}\n`)).toEqual({
      step: 'tool_use Bash',
      pendingTool: 'Bash',
    })
  })

  test('a trailing tool_result is not pending', () => {
    expect(describeLastStep(`${toolUse}\n${toolResult}\n`)).toEqual({
      step: 'tool_result',
      pendingTool: null,
    })
  })

  test('skips non-message and malformed trailing lines', () => {
    expect(describeLastStep(`${toolUse}\n{"type":"summary"}\nnot json\n`).pendingTool).toBe('Bash')
  })

  test('empty transcript is unknown', () => {
    expect(describeLastStep('')).toEqual({ step: 'unknown', pendingTool: null })
  })
})

describe('findStalledTranscripts with a pending tool', () => {
  const NOW = 1_000_000_000
  const THRESHOLDS = { idleMinutes: 4, pendingToolMinutes: 30 }
  const pending = () => Promise.resolve({ step: 'tool_use Bash', pendingTool: 'Bash' })
  const idle = () => Promise.resolve({ step: 'assistant message', pendingTool: null })
  const at = (minutes: number) => () => Promise.resolve(NOW - minutes * 60_000)

  test('idle past 4 minutes with no pending tool is stalled', async () => {
    const result = await findStalledTranscripts(['agent-a.jsonl'], NOW, THRESHOLDS, at(5), idle)
    expect(result).toHaveLength(1)
  })

  test('a pending tool is not reported before 30 minutes', async () => {
    expect(await findStalledTranscripts(['agent-a.jsonl'], NOW, THRESHOLDS, at(29), pending)).toEqual([])
  })

  test('a pending tool past 30 minutes names the step and tool', async () => {
    const result = await findStalledTranscripts(['agent-a.jsonl'], NOW, THRESHOLDS, at(31), pending)
    expect(result[0]).toMatchObject({ lastStep: 'tool_use Bash', pendingTool: 'Bash' })
  })
})
