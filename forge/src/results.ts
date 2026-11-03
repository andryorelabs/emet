import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { resolveRepoRoot } from './config'

const USAGE = `usage: forge results --run <id> --write <ticket> --status <status> --report <path> --risk "<Risk: ...>" [--root <dir>]
       forge results --run <id> --read <ticket> [--root <dir>]

status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Files live in .forge/runs/<id>/results/<ticket>.json (local; only the coordinator writes the tracker).`

export const RESULT_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] as const

export type ResultStatus = (typeof RESULT_STATUSES)[number]

export interface WorkerResult {
  readonly status: ResultStatus
  readonly reportPath: string
  readonly risk: string
}

function resultPath(resultsDirectory: string, ticket: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ticket) || ticket.includes('..')) {
    throw new Error(`invalid ticket id: ${ticket}`)
  }
  return path.join(resultsDirectory, `${ticket}.json`)
}

function validateResult(result: WorkerResult): void {
  if (!RESULT_STATUSES.includes(result.status)) {
    throw new Error(`invalid status "${result.status}" (expected ${RESULT_STATUSES.join('|')})`)
  }
  if (result.reportPath.trim().length === 0) throw new Error('report path is empty')
  if (!/^Risk: \S/.test(result.risk)) {
    throw new Error('risk line must be "Risk: none" or "Risk: item N (reason)"')
  }
}

export function writeResult(resultsDirectory: string, ticket: string, result: WorkerResult): void {
  const target = resultPath(resultsDirectory, ticket)
  validateResult(result)
  mkdirSync(resultsDirectory, { recursive: true })
  const { status, reportPath, risk } = result
  writeFileSync(target, `${JSON.stringify({ status, reportPath, risk }, null, 2)}\n`)
}

export function readResult(resultsDirectory: string, ticket: string): WorkerResult | null {
  const target = resultPath(resultsDirectory, ticket)
  if (!existsSync(target)) return null
  const parsed = JSON.parse(readFileSync(target, 'utf8')) as WorkerResult
  validateResult(parsed)
  return parsed
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
  const resultsDirectory = path.join(root, '.forge', 'runs', runId, 'results')
  const writeTicket = readFlag(argv, '--write')
  const readTicket = readFlag(argv, '--read')

  try {
    if (writeTicket !== undefined) {
      const status = readFlag(argv, '--status')
      const reportPath = readFlag(argv, '--report')
      const risk = readFlag(argv, '--risk')
      if (status === undefined || reportPath === undefined || risk === undefined) {
        console.error(USAGE)
        process.exitCode = 2
        return
      }
      writeResult(resultsDirectory, writeTicket, {
        status: status as ResultStatus,
        reportPath,
        risk,
      })
      return
    }
    if (readTicket !== undefined) {
      const result = readResult(resultsDirectory, readTicket)
      if (result === null) {
        console.error(`forge results: no result for ${readTicket}`)
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(result))
      return
    }
    console.error(USAGE)
    process.exitCode = 2
  } catch (error) {
    console.error(`forge results: ${(error as Error).message}`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
