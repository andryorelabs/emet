import { describe, expect, test } from 'bun:test'

import { classifyRun, resolveSessionSlug } from './runs'

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
