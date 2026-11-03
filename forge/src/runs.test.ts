import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  classifyRun,
  completionEventPath,
  isAnchorAlive,
  readCompletionEvent,
  readProcessStartToken,
  readStallNudgeCount,
  recordStallNudge,
  resolveSessionSlug,
  writeCompletionEvent,
  type CompletionEvent,
} from './runs'

describe('completion events and stall nudges', () => {
  const makeCommonDirectory = () => mkdtempSync(path.join(os.tmpdir(), 'forge-runs-'))
  const sampleEvent: CompletionEvent = {
    runId: 'run-a',
    ticket: 'CLA-50',
    event: 'SubagentStop',
    outcome: 'allowed',
    at: '2026-11-03T00:00:00.000Z',
    sessionId: 's1',
    branch: 'cla-50-x',
    commits: 2,
  }

  test('events live under <common-dir>/.forge/runs/<id>/events/<ticket>.json and round-trip', () => {
    const commonDirectory = makeCommonDirectory()
    try {
      writeCompletionEvent(commonDirectory, sampleEvent)
      expect(completionEventPath(commonDirectory, 'run-a', 'CLA-50')).toBe(
        path.join(commonDirectory, '.forge', 'runs', 'run-a', 'events', 'CLA-50.json'),
      )
      expect(readCompletionEvent(commonDirectory, 'run-a', 'CLA-50')).toEqual(sampleEvent)
      expect(readCompletionEvent(commonDirectory, 'run-a', 'CLA-99')).toBeNull()
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true })
    }
  })

  test('a corrupt event file reads as null, and unsafe ids are rejected', () => {
    const commonDirectory = makeCommonDirectory()
    try {
      writeCompletionEvent(commonDirectory, sampleEvent)
      writeFileSync(completionEventPath(commonDirectory, 'run-a', 'CLA-50'), '{nope')
      expect(readCompletionEvent(commonDirectory, 'run-a', 'CLA-50')).toBeNull()
      expect(() => completionEventPath(commonDirectory, '../x', 'CLA-50')).toThrow()
      expect(() => completionEventPath(commonDirectory, 'run-a', 'a/b')).toThrow()
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true })
    }
  })

  test('nudges are granted up to the cap, persisted, and never refilled', () => {
    const commonDirectory = makeCommonDirectory()
    try {
      expect(recordStallNudge(commonDirectory, 'run-a', 'CLA-50', 2)).toEqual({ granted: true, count: 1, cap: 2 })
      expect(recordStallNudge(commonDirectory, 'run-a', 'CLA-50', 2)).toEqual({ granted: true, count: 2, cap: 2 })
      expect(recordStallNudge(commonDirectory, 'run-a', 'CLA-50', 2)).toEqual({ granted: false, count: 2, cap: 2 })
      expect(readStallNudgeCount(commonDirectory, 'run-a', 'CLA-50')).toBe(2)
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true })
    }
  })

  test('a corrupt nudge counter counts as exhausted, never as a refill', () => {
    const commonDirectory = makeCommonDirectory()
    try {
      recordStallNudge(commonDirectory, 'run-a', 'CLA-50', 3)
      const nudgeFile = path.join(commonDirectory, '.forge', 'runs', 'run-a', 'nudges', 'CLA-50.json')
      expect(JSON.parse(readFileSync(nudgeFile, 'utf8'))).toEqual({ count: 1 })
      writeFileSync(nudgeFile, 'garbage')
      expect(recordStallNudge(commonDirectory, 'run-a', 'CLA-50', 3).granted).toBe(false)
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true })
    }
  })
})

describe('classifyRun', () => {
  test('live: anchor process is still running', () => {
    const verdict = classifyRun(4242, 'slug', 'run-a', {
      isAnchorAliveFn: () => true,
      transcriptMtimeFn: () => null,
    })
    expect(verdict).toBe('live')
  })

  test('idle: anchor is gone but the transcript was touched recently', () => {
    const now = 1_000_000_000
    const verdict = classifyRun(4242, 'slug', 'run-a', {
      now,
      idleThresholdMs: 90 * 60_000,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - 10 * 60_000,
    })
    expect(verdict).toBe('idle')
  })

  test('dead: anchor is gone and the transcript is older than the idle threshold', () => {
    const now = 1_000_000_000
    const verdict = classifyRun(4242, 'slug', 'run-a', {
      now,
      idleThresholdMs: 90 * 60_000,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - 200 * 60_000,
    })
    expect(verdict).toBe('dead')
  })

  test('dead: anchor is gone and the transcript is unreadable', () => {
    const verdict = classifyRun(4242, 'slug', 'run-a', {
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => null,
    })
    expect(verdict).toBe('dead')
  })

  test('a transcript touched exactly at the threshold still counts as idle', () => {
    const now = 1_000_000_000
    const idleThresholdMs = 90 * 60_000
    const verdict = classifyRun(4242, 'slug', 'run-a', {
      now,
      idleThresholdMs,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - idleThresholdMs,
    })
    expect(verdict).toBe('idle')
  })
})

describe('resolveSessionSlug', () => {
  test('replaces every path separator with a dash', () => {
    expect(resolveSessionSlug('/home/andryore/code/andryore-dev')).toBe(
      '-home-andryore-code-andryore-dev',
    )
  })
})

describe('process start token', () => {
  test('reads a numeric start token for a live process', () => {
    expect(readProcessStartToken(process.pid)).toMatch(/^\d+$/)
  })

  test('returns undefined for a missing process', () => {
    expect(readProcessStartToken(2_000_000_000)).toBeUndefined()
  })

  test('classifyRun forwards the token to the liveness check', () => {
    const received: Array<string | undefined> = []
    classifyRun(4242, 'slug', 'run-a', {
      anchorStartToken: '777',
      isAnchorAliveFn: (_pid, token) => {
        received.push(token)
        return true
      },
    })
    expect(received).toEqual(['777'])
  })

  test('a legacy run without a token is classified by the injected check with no token', () => {
    const received: Array<string | undefined> = []
    classifyRun(4242, 'slug', 'run-a', {
      isAnchorAliveFn: (_pid, token) => {
        received.push(token)
        return true
      },
    })
    expect(received).toEqual([undefined])
  })

  test('a mismatched start token reports not alive', () => {
    expect(isAnchorAlive(process.pid, 'not-a-real-token')).toBe(false)
  })
})
