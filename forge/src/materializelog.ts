import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { resolveRepoRoot } from './config'

const USAGE = `usage: forge materialize-log --run <id> --record <localKey> <trackerId> [--root <dir>]
       forge materialize-log --run <id> --lookup <localKey> [--root <dir>]

--record persists immediately to .forge/runs/<id>/materialize.json.
--lookup prints the tracker id and exits 0, or exits 1 when the key was never recorded
(materialize re-runs skip recorded keys).`

type MaterializeLog = Record<string, string>

function readLog(logPath: string): MaterializeLog {
  if (!existsSync(logPath)) return {}
  return JSON.parse(readFileSync(logPath, 'utf8')) as MaterializeLog
}

export function lookupTicket(logPath: string, localKey: string): string | null {
  const log = readLog(logPath)
  return Object.hasOwn(log, localKey) ? log[localKey]! : null
}

export function recordTicket(logPath: string, localKey: string, trackerId: string): void {
  const log = readLog(logPath)
  if (Object.hasOwn(log, localKey)) {
    if (log[localKey] === trackerId) return
    throw new Error(
      `${localKey} already recorded as ${log[localKey]}; refusing to record ${trackerId}`,
    )
  }
  log[localKey] = trackerId
  mkdirSync(path.dirname(logPath), { recursive: true })
  const temporaryPath = `${logPath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(log, null, 2)}\n`)
  renameSync(temporaryPath, logPath)
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
  const logPath = path.join(root, '.forge', 'runs', runId, 'materialize.json')
  const recordIndex = argv.indexOf('--record')
  const lookupKey = readFlag(argv, '--lookup')

  try {
    if (recordIndex !== -1) {
      const localKey = argv[recordIndex + 1]
      const trackerId = argv[recordIndex + 2]
      if (localKey === undefined || trackerId === undefined) {
        console.error(USAGE)
        process.exitCode = 2
        return
      }
      recordTicket(logPath, localKey, trackerId)
      return
    }
    if (lookupKey !== undefined) {
      const trackerId = lookupTicket(logPath, lookupKey)
      if (trackerId === null) {
        process.exitCode = 1
        return
      }
      console.log(trackerId)
      return
    }
    console.error(USAGE)
    process.exitCode = 2
  } catch (error) {
    console.error(`forge materialize-log: ${(error as Error).message}`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
