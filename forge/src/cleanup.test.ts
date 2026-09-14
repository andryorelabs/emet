import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { listReservations, releaseTicket } from './claims'
import {
  deleteAndReleaseTicket,
  findWorktreeEntryForBranch,
  guardBranch,
  parseCleanupArguments,
} from './cleanup'
import type { WorktreeEntry } from './worktrees'

function lockedEntry(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    directory: '/repo/.claude/worktrees/agent-a1',
    branch: 'ao-260-forge-cleanup-run-scoped',
    lockedReason:
      'forge run=session-a ticket=AO-260 anchor=4242 at=2026-09-07T00:00:00Z',
    ...overrides,
  }
}

describe('parseCleanupArguments', () => {
  test('defaults to no run scope, not dry, not --all, not --force', () => {
    expect(parseCleanupArguments([])).toEqual({
      dryRun: false,
      runId: null,
      all: false,
      force: false,
    })
  })

  test('--dry-run sets dryRun', () => {
    expect(parseCleanupArguments(['--dry-run'])).toEqual({
      dryRun: true,
      runId: null,
      all: false,
      force: false,
    })
  })

  test('--run <id> captures the run id', () => {
    expect(parseCleanupArguments(['--run', 'session-a'])).toEqual({
      dryRun: false,
      runId: 'session-a',
      all: false,
      force: false,
    })
  })

  test('--dry-run --run <id> combine', () => {
    expect(parseCleanupArguments(['--dry-run', '--run', 'session-a'])).toEqual({
      dryRun: true,
      runId: 'session-a',
      all: false,
      force: false,
    })
  })

  test('--all sets the explicit repo-wide flag', () => {
    expect(parseCleanupArguments(['--all'])).toEqual({
      dryRun: false,
      runId: null,
      all: true,
      force: false,
    })
  })

  test('--force sets the force flag', () => {
    expect(parseCleanupArguments(['--force'])).toEqual({
      dryRun: false,
      runId: null,
      all: false,
      force: true,
    })
  })

  test('--run with no value throws', () => {
    expect(() => parseCleanupArguments(['--run'])).toThrow()
  })

  test('--run followed by another flag throws', () => {
    expect(() => parseCleanupArguments(['--run', '--dry-run'])).toThrow()
  })

  test('--run and --all together throws', () => {
    expect(() =>
      parseCleanupArguments(['--run', 'session-a', '--all']),
    ).toThrow()
  })
})

describe('findWorktreeEntryForBranch', () => {
  test('matches an ao-* branch directly on entry.branch', () => {
    const entry = lockedEntry()
    expect(
      findWorktreeEntryForBranch('ao-260-forge-cleanup-run-scoped', [entry]),
    ).toBe(entry)
  })

  test('matches a worktree-agent-* scaffold branch via the directory basename', () => {
    const entry = lockedEntry({ directory: '/repo/.claude/worktrees/agent-a1' })
    expect(findWorktreeEntryForBranch('worktree-agent-a1', [entry])).toBe(entry)
  })

  test('returns undefined when nothing matches', () => {
    const entry = lockedEntry()
    expect(
      findWorktreeEntryForBranch('ao-999-unrelated', [entry]),
    ).toBeUndefined()
  })
})

describe('guardBranch', () => {
  test('a live worktree checkout is always in-use, before any lock check', () => {
    const outcome = guardBranch(true, lockedEntry(), null)
    expect(outcome).toEqual({ done: true, category: 'in-use' })
  })

  test('no matched entry and no run scope proceeds to content classification', () => {
    const outcome = guardBranch(false, undefined, null)
    expect(outcome).toEqual({ done: false, owner: null })
  })

  test('no matched entry in --run mode is out-of-scope', () => {
    const outcome = guardBranch(false, undefined, 'session-a')
    expect(outcome).toEqual({ done: true, category: 'out-of-scope' })
  })

  test('an unlocked matched entry with no run scope proceeds to content classification', () => {
    const outcome = guardBranch(
      false,
      lockedEntry({ lockedReason: null }),
      null,
    )
    expect(outcome).toEqual({ done: false, owner: null })
  })

  describe('--run scoping', () => {
    test('a locked worktree owned by the target run proceeds, carrying its owner', () => {
      const outcome = guardBranch(false, lockedEntry(), 'session-a')
      expect(outcome).toEqual({
        done: false,
        owner: {
          runId: 'session-a',
          ticket: 'AO-260',
          anchorPid: 4242,
          at: '2026-09-07T00:00:00Z',
        },
      })
    })

    test('a locked worktree owned by a different run is out-of-scope', () => {
      const outcome = guardBranch(false, lockedEntry(), 'session-other')
      expect(outcome).toEqual({ done: true, category: 'out-of-scope' })
    })

    test('a lock reason that is not /forge-shaped is out-of-scope', () => {
      const outcome = guardBranch(
        false,
        lockedEntry({ lockedReason: 'someone else, manually' }),
        'session-a',
      )
      expect(outcome).toEqual({ done: true, category: 'out-of-scope' })
    })
  })

  describe('default/--all repo-wide sweep', () => {
    test('a locked worktree whose owning run is live is protected, never reaching content classification', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => 'live')
      expect(outcome).toEqual({
        done: true,
        category: 'live-or-idle-protected',
        ownerRunId: 'session-a',
        runVerdict: 'live',
      })
    })

    test('a locked worktree whose owning run is idle is protected too', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => 'idle')
      expect(outcome).toEqual({
        done: true,
        category: 'live-or-idle-protected',
        ownerRunId: 'session-a',
        runVerdict: 'idle',
      })
    })

    test('a locked worktree whose owning run is dead still never reaches classification without --force: it is just "locked, protected"', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => 'dead')
      expect(outcome).toEqual({ done: true, category: 'locked-protected' })
    })

    test('--force lifts protection on a dead owner, letting classification proceed', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => 'dead', true)
      expect(outcome).toEqual({
        done: false,
        owner: {
          runId: 'session-a',
          ticket: 'AO-260',
          anchorPid: 4242,
          at: '2026-09-07T00:00:00Z',
        },
      })
    })

    test('--force does not lift protection on a live or idle owner', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => 'live', true)
      expect(outcome).toEqual({
        done: true,
        category: 'live-or-idle-protected',
        ownerRunId: 'session-a',
        runVerdict: 'live',
      })
    })

    test('a locked worktree with a non-/forge lock reason is "locked, protected" even with --force', () => {
      const outcome = guardBranch(
        false,
        lockedEntry({ lockedReason: 'wip, do not touch' }),
        null,
        () => 'dead',
        true,
      )
      expect(outcome).toEqual({ done: true, category: 'locked-protected' })
    })
  })
})

describe('deleteAndReleaseTicket', () => {
  let forgeDirectory: string

  beforeEach(() => {
    forgeDirectory = mkdtempSync(path.join(os.tmpdir(), 'forge-cleanup-test-'))
  })

  afterEach(() => {
    rmSync(forgeDirectory, { recursive: true, force: true })
  })

  test('releases the ticket reservation after a successful deletion', async () => {
    await Bun.write(
      path.join(forgeDirectory, 'tickets', 'AO-260.json'),
      JSON.stringify({
        runId: 'session-a',
        anchorPid: 4242,
        ticket: 'AO-260',
        reservedAt: Date.now(),
        sessionSlug: '-repo',
      }),
    )
    expect(await listReservations(forgeDirectory)).toHaveLength(1)

    const result = await deleteAndReleaseTicket(
      'ao-260-forge-cleanup-run-scoped',
      'AO-260',
      async (branch) => ({ ok: true, message: branch }),
      (ticket) => releaseTicket(ticket, forgeDirectory),
    )

    expect(result).toEqual({
      ok: true,
      message: 'ao-260-forge-cleanup-run-scoped',
    })
    expect(await listReservations(forgeDirectory)).toEqual([])
  })

  test('never releases the reservation when the deletion itself fails', async () => {
    await Bun.write(
      path.join(forgeDirectory, 'tickets', 'AO-260.json'),
      JSON.stringify({
        runId: 'session-a',
        anchorPid: 4242,
        ticket: 'AO-260',
        reservedAt: Date.now(),
        sessionSlug: '-repo',
      }),
    )

    const result = await deleteAndReleaseTicket(
      'ao-260-forge-cleanup-run-scoped',
      'AO-260',
      async (branch) => ({ ok: false, message: `${branch} — locked` }),
      (ticket) => releaseTicket(ticket, forgeDirectory),
    )

    expect(result.ok).toBe(false)
    expect(await listReservations(forgeDirectory)).toHaveLength(1)
  })

  test('no ticket is passed outside --run mode: releaseFn is never invoked', async () => {
    let releaseCalls = 0
    const result = await deleteAndReleaseTicket(
      'worktree-agent-a1',
      undefined,
      async (branch) => ({ ok: true, message: branch }),
      async () => {
        releaseCalls += 1
      },
    )

    expect(result.ok).toBe(true)
    expect(releaseCalls).toBe(0)
  })
})
