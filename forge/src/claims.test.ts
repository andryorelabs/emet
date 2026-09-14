import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  didReserveTicket,
  listReservations,
  pruneDeadReservations,
  releaseTicket,
  type Reservation,
  shouldWriteReservation,
} from './claims'

/**
 * A pid outside the kernel's pid range (`pid_max` is 4194304 even on a
 * 64-bit system with the largest legal setting) can never belong to a real
 * process, real or reused — the cheapest reliable stand-in for "this run's
 * anchor is definitely dead" without mocking `/proc`.
 */
const IMPOSSIBLE_PID = 999_999_999

/**
 * A pid standing in for a "live" anchor — paired with an injected
 * `isAnchorAliveFn` rather than a real `/proc`-backed `claude` ancestor,
 * which doesn't exist on a plain CI runner.
 */
const LIVE_MARKER_PID = 424_242

describe('didReserveTicket / listReservations / releaseTicket', () => {
  let forgeDirectory: string

  beforeEach(() => {
    forgeDirectory = mkdtempSync(path.join(os.tmpdir(), 'forge-claims-test-'))
  })

  afterEach(() => {
    rmSync(forgeDirectory, { recursive: true, force: true })
  })

  test('round-trips a reservation', async () => {
    const isAcquired = await didReserveTicket(
      'run-a',
      process.pid,
      'AO-999',
      forgeDirectory,
    )
    expect(isAcquired).toBe(true)

    const reservations = await listReservations(forgeDirectory)
    expect(reservations).toEqual([
      expect.objectContaining({ runId: 'run-a', ticket: 'AO-999' }),
    ])

    await releaseTicket('AO-999', forgeDirectory)
    expect(await listReservations(forgeDirectory)).toEqual([])
  })

  test('racing: only the first of two calls for the same ticket wins while the owner is live', async () => {
    const isFirst = await didReserveTicket(
      'run-a',
      LIVE_MARKER_PID,
      'AO-998',
      forgeDirectory,
    )
    expect(isFirst).toBe(true)

    const isSecond = await didReserveTicket(
      'run-b',
      process.pid,
      'AO-998',
      forgeDirectory,
      { isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID },
    )
    expect(isSecond).toBe(false)

    const reservations = await listReservations(forgeDirectory)
    expect(reservations).toEqual([
      expect.objectContaining({ runId: 'run-a', ticket: 'AO-998' }),
    ])
  })

  test('the same run re-reserving its own ticket is idempotent', async () => {
    await didReserveTicket('run-a', process.pid, 'AO-996', forgeDirectory)
    const isAgain = await didReserveTicket(
      'run-a',
      process.pid,
      'AO-996',
      forgeDirectory,
    )
    expect(isAgain).toBe(true)
  })

  test('reclaims a reservation whose owning run has no live anchor', async () => {
    const isFirst = await didReserveTicket(
      'run-dead',
      IMPOSSIBLE_PID,
      'AO-997',
      forgeDirectory,
    )
    expect(isFirst).toBe(true)

    const isReclaimed = await didReserveTicket(
      'run-c',
      process.pid,
      'AO-997',
      forgeDirectory,
    )
    expect(isReclaimed).toBe(true)

    const reservations = await listReservations(forgeDirectory)
    expect(reservations).toEqual([
      expect.objectContaining({ runId: 'run-c', ticket: 'AO-997' }),
    ])
  })

  /**
  Regression test for the AO-285 incident (see claims.ts's file-level
  doc comment): a coordinator called this function with its positional
  arguments in the wrong order — `(ticket, runId, anchorPid)` instead of
  `(runId, anchorPid, ticket)` — and the malformed reservation was written to
  disk with no error, leaving that ticket permanently unreserved.
  */
  describe('argument validation (AO-285 regression)', () => {
    test('rejects the exact AO-285 swapped call shape (ticket, runId, anchorPid)', () => {
      expect(
        didReserveTicket(
          'AO-285' as unknown as string,
          'session_014iteBD9ym4zLFz5NSPVhPu' as unknown as number,
          1_090_684 as unknown as string,
          forgeDirectory,
        ),
      ).rejects.toThrow(/anchorPid must be a positive integer/)
    })

    test('rejects a numeric ticket', () => {
      expect(
        didReserveTicket(
          'run-a',
          process.pid,
          1_090_684 as unknown as string,
          forgeDirectory,
        ),
      ).rejects.toThrow(/ticket must match/)
    })

    test('rejects a non-integer anchorPid', () => {
      expect(
        didReserveTicket(
          'run-a',
          'session_abc123' as unknown as number,
          'AO-1',
          forgeDirectory,
        ),
      ).rejects.toThrow(/anchorPid must be a positive integer/)
    })

    test('rejects an empty runId', () => {
      expect(
        didReserveTicket('', process.pid, 'AO-1', forgeDirectory),
      ).rejects.toThrow(/runId must be a non-empty string/)
    })

    test('rejects a ticket that does not match AO-<digits>', () => {
      expect(
        didReserveTicket('run-a', process.pid, 'not-a-ticket', forgeDirectory),
      ).rejects.toThrow(/ticket must match/)
    })

    test('a rejected call never writes a reservation file', async () => {
      expect(
        didReserveTicket('', process.pid, 'AO-1', forgeDirectory),
      ).rejects.toThrow()
      expect(await listReservations(forgeDirectory)).toEqual([])
    })

    test('releaseTicket also rejects a malformed ticket', () => {
      expect(releaseTicket('1090684', forgeDirectory)).rejects.toThrow(
        /ticket must match/,
      )
    })
  })
})

describe('pruneDeadReservations', () => {
  let forgeDirectory: string
  let ticketsDirectory: string

  beforeEach(() => {
    forgeDirectory = mkdtempSync(path.join(os.tmpdir(), 'forge-claims-test-'))
    ticketsDirectory = path.join(forgeDirectory, 'tickets')
    mkdirSync(ticketsDirectory, { recursive: true })
  })

  afterEach(() => {
    rmSync(forgeDirectory, { recursive: true, force: true })
  })

  test('releases a dead reservation and leaves a live one untouched', async () => {
    await didReserveTicket('run-dead', IMPOSSIBLE_PID, 'AO-1', forgeDirectory)
    await didReserveTicket(
      'run-live',
      LIVE_MARKER_PID,
      'AO-2',
      forgeDirectory,
      { isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID },
    )

    const result = await pruneDeadReservations(forgeDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    })

    expect(result.releasedTickets).toEqual(['AO-1'])
    expect(result.malformedFiles).toEqual([])
    const remaining = await listReservations(forgeDirectory)
    expect(remaining).toEqual([
      expect.objectContaining({ runId: 'run-live', ticket: 'AO-2' }),
    ])
  })

  test('dry-run reports what would be released without deleting anything', async () => {
    await didReserveTicket('run-dead', IMPOSSIBLE_PID, 'AO-3', forgeDirectory)

    const result = await pruneDeadReservations(forgeDirectory, undefined, true)

    expect(result.releasedTickets).toEqual(['AO-3'])
    expect(await listReservations(forgeDirectory)).toHaveLength(1)
  })

  /**
  Reproduces the exact AO-285 on-disk shape found in this repo's own
  `.git/forge/tickets/` — `runId`/`anchorPid`/`ticket` written in the wrong
  order, so `anchorPid` holds a session-id string and `ticket` holds a bare
  number. Must be reported, never crash the sweep, and never be silently
  deleted (a sweep that can't classify a record's owner must never guess at
  whether it's safe to remove).
  */
  test('a malformed reservation file is reported, not classified or deleted', async () => {
    writeFileSync(
      path.join(ticketsDirectory, '1090684.json'),
      JSON.stringify({
        runId: 'AO-285',
        anchorPid: 'session_014iteBD9ym4zLFz5NSPVhPu',
        ticket: 1_090_684,
        reservedAt: 1_788_972_769_764,
        sessionSlug: '-home-andryore-orca-workspaces-andryore-dev-perch',
      }),
    )
    await didReserveTicket('run-dead', IMPOSSIBLE_PID, 'AO-4', forgeDirectory)

    const result = await pruneDeadReservations(forgeDirectory)

    expect(result.releasedTickets).toEqual(['AO-4'])
    expect(result.malformedFiles).toEqual(['1090684.json'])
    expect(
      Bun.file(path.join(ticketsDirectory, '1090684.json')).size,
    ).toBeGreaterThan(0)
  })

  test('an empty or missing tickets directory prunes cleanly', async () => {
    rmSync(ticketsDirectory, { recursive: true, force: true })
    const result = await pruneDeadReservations(forgeDirectory)
    expect(result).toEqual({ releasedTickets: [], malformedFiles: [] })
  })
})

describe('shouldWriteReservation', () => {
  const existing: Reservation = {
    runId: 'run-a',
    anchorPid: 1234,
    ticket: 'AO-1',
    reservedAt: 0,
    sessionSlug: '-home-andryore-code-andryore-dev',
  }

  test('no existing reservation: any run may write it', () => {
    expect(shouldWriteReservation('run-b', undefined, 'dead')).toBe(true)
  })

  test('the same run may always re-write its own reservation', () => {
    expect(shouldWriteReservation('run-a', existing, 'live')).toBe(true)
  })

  test('a different run cannot take a live reservation', () => {
    expect(shouldWriteReservation('run-b', existing, 'live')).toBe(false)
  })

  test('a different run cannot take an idle (ambiguous) reservation', () => {
    expect(shouldWriteReservation('run-b', existing, 'idle')).toBe(false)
  })

  test('a different run can reclaim a dead reservation', () => {
    expect(shouldWriteReservation('run-b', existing, 'dead')).toBe(true)
  })
})
