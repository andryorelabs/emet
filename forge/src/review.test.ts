import { describe, expect, test } from 'bun:test'

import {
  type Ledger,
  addRuling,
  emptyLedger,
  formatRulings,
  nextEscalationModel,
  parseFindings,
  recordRound,
  triageOrder,
} from './review'

const finding = (over: Record<string, unknown> = {}) => ({
  id: 'F1',
  file: 'a.ts',
  line: 3,
  severity: 'blocker',
  kind: 'patch',
  claim: 'bad',
  ...over,
})

describe('parseFindings', () => {
  test('accepts a valid array and rejects bad kind/severity/shape', () => {
    expect(parseFindings(JSON.stringify([finding()]))).toHaveLength(1)
    expect(() => parseFindings('nope')).toThrow()
    expect(() => parseFindings(JSON.stringify({}))).toThrow()
    expect(() => parseFindings(JSON.stringify([finding({ kind: 'x' })]))).toThrow(/kind/)
    expect(() => parseFindings(JSON.stringify([finding({ severity: 'x' })]))).toThrow(/severity/)
    expect(() => parseFindings(JSON.stringify([finding({ line: 'a' })]))).toThrow(/line/)
  })
})

describe('triageOrder', () => {
  test('orders intent_gap, bad_plan, patch, defer', () => {
    const list = parseFindings(
      JSON.stringify([
        finding({ id: 'd', kind: 'defer' }),
        finding({ id: 'p', kind: 'patch' }),
        finding({ id: 'i', kind: 'intent_gap' }),
        finding({ id: 'b', kind: 'bad_plan' }),
      ]),
    )
    expect(triageOrder(list).map((f) => f.id)).toEqual(['i', 'b', 'p', 'd'])
  })
})

describe('recordRound', () => {
  const cap = 2

  test('round one keeps findings open', () => {
    const result = recordRound(emptyLedger('T'), parseFindings(JSON.stringify([finding()])), {
      changedFiles: [],
      reviewRounds: cap,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.ledger.findings[0]?.status).toBe('open')
  })

  test('recheck defers a new blocker that cites nothing and touches no changed file', () => {
    const first = recordRound(emptyLedger('T'), parseFindings(JSON.stringify([finding()])), {
      changedFiles: [],
      reviewRounds: cap,
    })
    if (!first.ok) throw new Error('unreachable')
    const second = recordRound(
      first.ledger,
      parseFindings(
        JSON.stringify([
          finding({ id: 'N1', file: 'z.ts' }),
          finding({ id: 'N2', file: 'z.ts', claim: 'follow-up to F1' }),
          finding({ id: 'N3', file: 'a.ts' }),
          finding({ id: 'N4', file: 'z.ts', severity: 'minor' }),
        ]),
      ),
      { changedFiles: ['a.ts'], reviewRounds: cap },
    )
    if (!second.ok) throw new Error('unreachable')
    const status = Object.fromEntries(second.ledger.findings.map((f) => [f.id, f.status]))
    expect(status).toMatchObject({ F1: 'open', N1: 'deferred', N2: 'open', N3: 'open', N4: 'open' })
  })

  test('refuses a round past the cap', () => {
    let ledger: Ledger = emptyLedger('T')
    for (let i = 0; i < cap; i++) {
      const r = recordRound(ledger, [], { changedFiles: [], reviewRounds: cap })
      if (!r.ok) throw new Error('unreachable')
      ledger = r.ledger
    }
    const over = recordRound(ledger, [], { changedFiles: [], reviewRounds: cap })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toMatch(/cap/)
  })
})

describe('escalation and rulings', () => {
  test('nextEscalationModel follows the map', () => {
    expect(nextEscalationModel({ sonnet: 'opus' }, 'sonnet')).toBe('opus')
    expect(nextEscalationModel({ sonnet: 'opus' }, 'opus')).toBeUndefined()
  })

  test('rulings are recorded and formatted', () => {
    const ledger = addRuling(emptyLedger('T'), { what: 'ship', why: 'low risk', cost: 'rework' })
    expect(formatRulings(ledger)).toBe('Ruling: ship — low risk — rework if wrong')
    expect(formatRulings(emptyLedger('T'))).toBe('')
  })
})
