import { describe, expect, test } from 'bun:test'

import { findSurfaceOverlaps, globsOverlap, parseTicketSurfaces } from './surfaces'

describe('globsOverlap', () => {
  test('detects overlaps', () => {
    expect(globsOverlap('forge/src/**', 'forge/src/guard.ts')).toBe(true)
    expect(globsOverlap('forge/src/guard*.ts', 'forge/src/guard.test.ts')).toBe(true)
    expect(globsOverlap('a/**/x.ts', 'a/b/c/*.ts')).toBe(true)
    expect(globsOverlap('src/{a,b}/*.ts', 'src/b/*.ts')).toBe(true)
    expect(globsOverlap('**', 'anything/here.md')).toBe(true)
  })
  test('detects disjoint globs', () => {
    expect(globsOverlap('forge/src/guard*.ts', 'forge/src/surfaces*.ts')).toBe(false)
    expect(globsOverlap('docs/**', 'forge/**')).toBe(false)
    expect(globsOverlap('a/*.ts', 'a/b/c.ts')).toBe(false)
    expect(globsOverlap('src/*.ts', 'src/*.md')).toBe(false)
  })
})

describe('findSurfaceOverlaps', () => {
  test('names the offending pair', () => {
    const overlaps = findSurfaceOverlaps([
      { ticket: 'CLA-1', surfaces: ['forge/src/guard*.ts'] },
      { ticket: 'CLA-2', surfaces: ['docs/**', 'forge/src/**'] },
      { ticket: 'CLA-3', surfaces: ['README.md'] },
    ])
    expect(overlaps).toEqual([
      { ticketA: 'CLA-1', globA: 'forge/src/guard*.ts', ticketB: 'CLA-2', globB: 'forge/src/**' },
    ])
  })
  test('parses both input shapes', () => {
    expect(parseTicketSurfaces({ A: ['x'] })).toEqual([{ ticket: 'A', surfaces: ['x'] }])
    expect(parseTicketSurfaces([{ ticket: 'A', surfaces: ['x'] }])).toEqual([
      { ticket: 'A', surfaces: ['x'] },
    ])
    expect(() => parseTicketSurfaces('nope')).toThrow()
  })
})
