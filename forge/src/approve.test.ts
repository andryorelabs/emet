import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { checkApproval, hashFile, writeApproval } from './approve'

let directory: string
let specPath: string
let ticketsPath: string
let approvalPath: string

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'forge-approve-'))
  specPath = path.join(directory, 'spec.md')
  ticketsPath = path.join(directory, 'tickets.json')
  approvalPath = path.join(directory, 'run', 'approval.json')
  writeFileSync(specPath, 'spec v1')
  writeFileSync(ticketsPath, '["CLA-1"]')
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('approval record', () => {
  test('writes spec hash, tickets hash and timestamp', () => {
    const record = writeApproval({ approvalPath, specPath, ticketsPath, now: new Date(0) })
    expect(record.specHash).toBe(hashFile(specPath))
    expect(record.ticketsHash).toBe(hashFile(ticketsPath))
    expect(record.approvedAt).toBe('1970-01-01T00:00:00.000Z')
  })

  test('check passes when nothing changed', () => {
    writeApproval({ approvalPath, specPath, ticketsPath })
    expect(checkApproval(approvalPath)).toEqual({ ok: true, reasons: [] })
  })

  test('check fails when the spec changes', () => {
    writeApproval({ approvalPath, specPath, ticketsPath })
    writeFileSync(specPath, 'spec v2')
    const result = checkApproval(approvalPath)
    expect(result.ok).toBe(false)
    expect(result.reasons[0]).toContain('spec')
  })

  test('check fails when the tickets change', () => {
    writeApproval({ approvalPath, specPath, ticketsPath })
    writeFileSync(ticketsPath, '["CLA-1","CLA-2"]')
    const result = checkApproval(approvalPath)
    expect(result.ok).toBe(false)
    expect(result.reasons[0]).toContain('tickets')
  })

  test('check fails when there is no approval record', () => {
    expect(checkApproval(approvalPath).ok).toBe(false)
  })
})
