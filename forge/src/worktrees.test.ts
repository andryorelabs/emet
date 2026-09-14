import { describe, expect, test } from 'bun:test'

import {
  parseWorktreeEntries,
  resolveWorktreeOwner,
  type WorktreeEntry,
} from './worktrees'

describe('parseWorktreeEntries', () => {
  test('parses an unlocked worktree as lockedReason: null', () => {
    const output = [
      'worktree /repo',
      'HEAD abcdef1234567890',
      'branch refs/heads/main',
      '',
    ].join('\n')
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: '/repo',
        branch: 'main',
        lockedReason: null,
        head: 'abcdef1234567890',
      },
    ])
  })

  test('parses a locked worktree with a reason', () => {
    const output = [
      'worktree /repo/.claude/worktrees/agent-abc',
      'HEAD abcdef1234567890',
      'branch refs/heads/ao-258-forge-claims-registry',
      'locked forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
      '',
    ].join('\n')
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: '/repo/.claude/worktrees/agent-abc',
        branch: 'ao-258-forge-claims-registry',
        lockedReason:
          'forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
        head: 'abcdef1234567890',
      },
    ])
  })

  test('parses a locked worktree with no reason as lockedReason: ""', () => {
    const output = [
      'worktree /repo/.claude/worktrees/agent-abc',
      'HEAD abcdef1234567890',
      'branch refs/heads/ao-258-forge-claims-registry',
      'locked',
      '',
    ].join('\n')
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: '/repo/.claude/worktrees/agent-abc',
        branch: 'ao-258-forge-claims-registry',
        lockedReason: '',
        head: 'abcdef1234567890',
      },
    ])
  })

  test('parses multiple entries, each resetting lockedReason', () => {
    const output = [
      'worktree /repo',
      'HEAD abcdef1234567890',
      'branch refs/heads/main',
      '',
      'worktree /repo/.claude/worktrees/agent-abc',
      'HEAD 1234567890abcdef',
      'branch refs/heads/ao-258-forge-claims-registry',
      'locked forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
      '',
    ].join('\n')
    const entries = parseWorktreeEntries(output)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.lockedReason).toBeNull()
    expect(entries[1]?.lockedReason).toBe(
      'forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
    )
  })
})

describe('resolveWorktreeOwner', () => {
  const baseEntry: WorktreeEntry = {
    directory: '/repo/.claude/worktrees/agent-abc',
    branch: 'ao-258-forge-claims-registry',
    lockedReason: null,
  }

  test('round-trips a well-formed /forge lock reason', () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason:
        'forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
    }
    expect(resolveWorktreeOwner(entry)).toEqual({
      runId: 'run-1',
      ticket: 'AO-258',
      anchorPid: 4242,
      at: '2026-09-07T20:00:00.000Z',
    })
  })

  test('reads an optional slug= field when present', () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason:
        'forge run=run-1 ticket=AO-258 anchor=4242 slug=-home-andryore-code-repo at=2026-09-07T20:00:00.000Z',
    }
    expect(resolveWorktreeOwner(entry)).toEqual({
      runId: 'run-1',
      ticket: 'AO-258',
      anchorPid: 4242,
      at: '2026-09-07T20:00:00.000Z',
      coordinatorSlug: '-home-andryore-code-repo',
    })
  })

  test('omits coordinatorSlug entirely for a lock reason written before slug= existed', () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason:
        'forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z',
    }
    expect(resolveWorktreeOwner(entry)?.coordinatorSlug).toBeUndefined()
    expect('coordinatorSlug' in (resolveWorktreeOwner(entry) ?? {})).toBe(false)
  })

  test('returns null for an unlocked worktree', () => {
    expect(resolveWorktreeOwner(baseEntry)).toBeNull()
  })

  test('returns null for a lock with no reason', () => {
    expect(resolveWorktreeOwner({ ...baseEntry, lockedReason: '' })).toBeNull()
  })

  test("returns null for a human's own unrelated lock reason", () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason: 'testing something, do not delete',
      }),
    ).toBeNull()
  })

  test('returns null when a required key is missing', () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason:
          'forge run=run-1 ticket=AO-258 at=2026-09-07T20:00:00.000Z',
      }),
    ).toBeNull()
  })

  test('returns null when anchor is not a finite number', () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason:
          'forge run=run-1 ticket=AO-258 anchor=nope at=2026-09-07T20:00:00.000Z',
      }),
    ).toBeNull()
  })
})
