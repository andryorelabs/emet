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
  // Fail-closed (see this function's own doc comment): a scope is mandatory
  // now, so no combination of flags that omits both --run and --all may
  // ever resolve to the old implicit repo-wide sweep.
  test('no flags at all throws — no implicit repo-wide sweep', () => {
    expect(() => parseCleanupArguments([])).toThrow(/--run.*--all/)
  })

  test('--dry-run alone still throws — scope is required even for a preview', () => {
    expect(() => parseCleanupArguments(['--dry-run'])).toThrow(/--run.*--all/)
  })

  test('--force alone still throws — --force is not a scope', () => {
    expect(() => parseCleanupArguments(['--force'])).toThrow(/--run.*--all/)
  })

  test('--dry-run --run <id> combine', () => {
    expect(parseCleanupArguments(['--dry-run', '--run', 'session-a'])).toEqual({
      dryRun: true,
      runId: 'session-a',
      all: false,
      force: false,
    })
  })

  test('--dry-run --all combine', () => {
    expect(parseCleanupArguments(['--dry-run', '--all'])).toEqual({
      dryRun: true,
      runId: null,
      all: true,
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

  test('--all sets the explicit repo-wide flag', () => {
    expect(parseCleanupArguments(['--all'])).toEqual({
      dryRun: false,
      runId: null,
      all: true,
      force: false,
    })
  })

  test('--force combines with --all', () => {
    expect(parseCleanupArguments(['--all', '--force'])).toEqual({
      dryRun: false,
      runId: null,
      all: true,
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

    test("uses the lock reason's own slug= as the coordinator's session slug, not the worktree's directory", () => {
      const seen: unknown[] = []
      guardBranch(
        false,
        lockedEntry({
          lockedReason:
            'forge run=session-a ticket=AO-260 anchor=4242 slug=-home-andryore-code-repo at=2026-09-07T00:00:00Z',
        }),
        null,
        (anchorPid, sessionSlug, runId) => {
          seen.push({ anchorPid, sessionSlug, runId })
          return 'dead'
        },
      )
      expect(seen).toEqual([
        { anchorPid: 4242, sessionSlug: '-home-andryore-code-repo', runId: 'session-a' },
      ])
    })

    test('falls back to the worktree directory-derived slug when the lock reason predates slug=', () => {
      const seen: unknown[] = []
      guardBranch(
        false,
        lockedEntry(),
        null,
        (anchorPid, sessionSlug, runId) => {
          seen.push({ anchorPid, sessionSlug, runId })
          return 'dead'
        },
      )
      expect(seen).toEqual([
        {
          anchorPid: 4242,
          sessionSlug: '-repo-.claude-worktrees-agent-a1',
          runId: 'session-a',
        },
      ])
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
      'session-a',
      async (branch) => ({ ok: true, message: branch }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
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
      'session-a',
      async (branch) => ({ ok: false, message: `${branch} — locked` }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
    )

    expect(result.ok).toBe(false)
    expect(await listReservations(forgeDirectory)).toHaveLength(1)
  })

  test('no ticket is passed outside --run mode: releaseFn is never invoked', async () => {
    let releaseCalls = 0
    const result = await deleteAndReleaseTicket(
      'worktree-agent-a1',
      undefined,
      undefined,
      async (branch) => ({ ok: true, message: branch }),
      async () => {
        releaseCalls += 1
        return { outcome: 'released' as const }
      },
    )

    expect(result.ok).toBe(true)
    expect(releaseCalls).toBe(0)
  })

  // Regression guard: `ticket`/`ownerRunId` are only ever set together by
  // `classifyOneBranch` (see this function's own doc comment) — this pins
  // that a `ticket` with no `ownerRunId` never releases anything, so a
  // future caller can't accidentally reintroduce the unscoped
  // `releaseTicket(ticket)` this function replaced.
  test('a ticket with no ownerRunId never releases either', async () => {
    let releaseCalls = 0
    const result = await deleteAndReleaseTicket(
      'ao-260-forge-cleanup-run-scoped',
      'AO-260',
      undefined,
      async (branch) => ({ ok: true, message: branch }),
      async () => {
        releaseCalls += 1
        return { outcome: 'released' as const }
      },
    )

    expect(result.ok).toBe(true)
    expect(releaseCalls).toBe(0)
  })

  test("does not release a reservation owned by a different run", async () => {
    await Bun.write(
      path.join(forgeDirectory, 'tickets', 'AO-260.json'),
      JSON.stringify({
        runId: 'session-other',
        anchorPid: 4242,
        ticket: 'AO-260',
        reservedAt: Date.now(),
        sessionSlug: '-repo',
      }),
    )

    const result = await deleteAndReleaseTicket(
      'ao-260-forge-cleanup-run-scoped',
      'AO-260',
      'session-a',
      async (branch) => ({ ok: true, message: branch }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
    )

    expect(result.ok).toBe(true)
    expect(await listReservations(forgeDirectory)).toEqual([
      expect.objectContaining({ runId: 'session-other', ticket: 'AO-260' }),
    ])
  })
})
