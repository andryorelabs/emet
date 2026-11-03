import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { resolveRepoRoot } from './config'

const USAGE = `usage: forge approve --run <id> --spec <file> [--tickets <file>] [--root <dir>]
       forge approve --run <id> --check [--root <dir>]

Writes .forge/runs/<id>/approval.json (spec hash, tickets hash, timestamp).
--tickets defaults to .forge/runs/<id>/tickets.json.
--check exits 1 when the spec or tickets changed since approval.`

export interface ApprovalRecord {
  readonly specPath: string
  readonly ticketsPath: string
  readonly specHash: string
  readonly ticketsHash: string
  readonly approvedAt: string
}

export interface ApprovalCheck {
  readonly ok: boolean
  readonly reasons: string[]
}

export function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function writeApproval(input: {
  approvalPath: string
  specPath: string
  ticketsPath: string
  now?: Date
}): ApprovalRecord {
  const specPath = path.resolve(input.specPath)
  const ticketsPath = path.resolve(input.ticketsPath)
  const record: ApprovalRecord = {
    specPath,
    ticketsPath,
    specHash: hashFile(specPath),
    ticketsHash: hashFile(ticketsPath),
    approvedAt: (input.now ?? new Date()).toISOString(),
  }
  mkdirSync(path.dirname(input.approvalPath), { recursive: true })
  writeFileSync(input.approvalPath, `${JSON.stringify(record, null, 2)}\n`)
  return record
}

function readApproval(approvalPath: string): ApprovalRecord | string {
  if (!existsSync(approvalPath)) return `no approval record at ${approvalPath}`
  try {
    const parsed = JSON.parse(readFileSync(approvalPath, 'utf8')) as Partial<ApprovalRecord>
    const fields = [
      parsed.specPath,
      parsed.ticketsPath,
      parsed.specHash,
      parsed.ticketsHash,
      parsed.approvedAt,
    ]
    if (fields.some((field) => typeof field !== 'string')) {
      return `approval record at ${approvalPath} is missing fields`
    }
    return parsed as ApprovalRecord
  } catch (error) {
    return `approval record at ${approvalPath} is unreadable: ${(error as Error).message}`
  }
}

function currentHashMismatch(label: string, filePath: string, expected: string): string | null {
  if (!existsSync(filePath)) return `${label} file is missing: ${filePath}`
  return hashFile(filePath) === expected ? null : `${label} changed since approval: ${filePath}`
}

export function checkApproval(approvalPath: string): ApprovalCheck {
  const record = readApproval(approvalPath)
  if (typeof record === 'string') return { ok: false, reasons: [record] }
  const reasons = [
    currentHashMismatch('spec', record.specPath, record.specHash),
    currentHashMismatch('tickets', record.ticketsPath, record.ticketsHash),
  ].filter((reason): reason is string => reason !== null)
  return { ok: reasons.length === 0, reasons }
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

export async function run(argv: string[]): Promise<void> {
  const runId = readFlag(argv, '--run')
  if (runId === undefined || runId.length === 0 || /[\\/]|^\.\.?$/.test(runId)) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const root = readFlag(argv, '--root') ?? (await resolveRepoRoot()) ?? process.cwd()
  const runDirectory = path.join(root, '.forge', 'runs', runId)
  const approvalPath = path.join(runDirectory, 'approval.json')

  if (argv.includes('--check')) {
    const result = checkApproval(approvalPath)
    console.log(JSON.stringify(result))
    process.exitCode = result.ok ? 0 : 1
    return
  }

  const specPath = readFlag(argv, '--spec')
  if (specPath === undefined) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const ticketsPath = readFlag(argv, '--tickets') ?? path.join(runDirectory, 'tickets.json')
  try {
    console.log(JSON.stringify(writeApproval({ approvalPath, specPath, ticketsPath })))
  } catch (error) {
    console.error(`forge approve: ${(error as Error).message}`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
