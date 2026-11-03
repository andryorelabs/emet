/**
 * Review findings ledger.
 *
 * Usage:
 *   forge review --ticket <ticket> --findings <file|-> [--changed <a,b>]
 *   forge review --ticket <ticket> --escalate --model <model>
 *   forge review --ticket <ticket> --rule <what> --why <why> --cost <cost>
 *   forge review --ticket <ticket> --rulings
 *
 * The ledger lives at `<repo>/.forge/review/<ticket>.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { ForgeConfigError, loadForgeConfigWithDefaults, resolveRepoRoot } from './config'
import { isOneOf } from './narrow'

const USAGE = `usage: forge review --ticket <ticket> --findings <file|-> [--changed <a,b>]
       forge review --ticket <ticket> --escalate --model <model>
       forge review --ticket <ticket> --rule <what> --why <why> --cost <cost>
       forge review --ticket <ticket> --rulings`

export const KINDS = ['intent_gap', 'bad_plan', 'patch', 'defer'] as const
export const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'nit'] as const
export type FindingKind = (typeof KINDS)[number]
export type Severity = (typeof SEVERITIES)[number]

export interface Finding {
  readonly id: string
  readonly file: string
  readonly line: number
  readonly severity: Severity
  readonly kind: FindingKind
  readonly claim: string
}

export interface LedgerFinding extends Finding {
  readonly status: 'open' | 'deferred' | 'resolved'
  readonly round: number
  readonly deferReason?: string
}

export interface Ruling {
  readonly what: string
  readonly why: string
  readonly cost: string
}

export interface Ledger {
  readonly ticket: string
  readonly rounds: number
  readonly findings: readonly LedgerFinding[]
  readonly rulings: readonly Ruling[]
}

export function emptyLedger(ticket: string): Ledger {
  return { ticket, rounds: 0, findings: [], rulings: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFinding(raw: unknown, index: number): Finding {
  if (!isRecord(raw)) throw new ForgeConfigError(`finding ${index} must be an object`)
  const { id, file, line, severity, kind, claim } = raw
  if (typeof id !== 'string' || !id) {
    throw new ForgeConfigError(`finding ${index}: id must be a non-empty string`)
  }
  if (typeof file !== 'string') throw new ForgeConfigError(`finding ${id}: file must be a string`)
  if (typeof line !== 'number' || !Number.isInteger(line)) {
    throw new ForgeConfigError(`finding ${id}: line must be an integer`)
  }
  if (!isOneOf(SEVERITIES, severity)) {
    throw new ForgeConfigError(`finding ${id}: severity must be one of ${SEVERITIES.join(', ')}`)
  }
  if (!isOneOf(KINDS, kind)) {
    throw new ForgeConfigError(`finding ${id}: kind must be one of ${KINDS.join(', ')}`)
  }
  if (typeof claim !== 'string') throw new ForgeConfigError(`finding ${id}: claim must be a string`)
  return { id, file, line, severity, kind, claim }
}

export function parseFindings(text: string): Finding[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ForgeConfigError('findings are not valid JSON')
  }
  if (!Array.isArray(parsed)) throw new ForgeConfigError('findings must be a JSON array')
  return parsed.map(parseFinding)
}

export function triageOrder<T extends { readonly kind: FindingKind }>(findings: readonly T[]): T[] {
  return findings.toSorted((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))
}

function isBlocking(severity: Severity): boolean {
  return severity === 'blocker' || severity === 'critical'
}

export interface RoundOptions {
  readonly changedFiles: readonly string[]
  readonly reviewRounds: number
}

export type RoundResult =
  | { readonly ok: true; readonly ledger: Ledger }
  | { readonly ok: false; readonly reason: string }

function citesPriorFinding(claim: string, priorIds: readonly string[]): boolean {
  return priorIds.some((priorId) => claim.split(/[^\w-]+/).includes(priorId))
}

export function recordRound(
  ledger: Ledger,
  findings: readonly Finding[],
  options: RoundOptions,
): RoundResult {
  if (ledger.rounds >= options.reviewRounds) {
    return {
      ok: false,
      reason: `review round cap reached (${ledger.rounds}/${options.reviewRounds}); escalate or rule on the open findings`,
    }
  }
  const round = ledger.rounds + 1
  const priorIds = ledger.findings.map((entry) => entry.id)
  const keptIds = new Set(
    ledger.findings.filter((entry) => entry.status !== 'deferred').map((entry) => entry.id),
  )
  const changed = new Set(options.changedFiles)
  const added: LedgerFinding[] = []
  for (const entry of triageOrder(findings)) {
    const exempt = round === 1 || !isBlocking(entry.severity) || keptIds.has(entry.id)
    if (exempt || citesPriorFinding(entry.claim, priorIds) || changed.has(entry.file)) {
      added.push({ ...entry, status: 'open', round })
      continue
    }
    added.push({
      ...entry,
      status: 'deferred',
      round,
      deferReason:
        'new blocker in recheck cites no prior finding and no file changed since last review',
    })
  }
  const reportedIds = new Set(findings.map((entry) => entry.id))
  const carried: LedgerFinding[] = []
  for (const entry of ledger.findings) {
    if (reportedIds.has(entry.id)) continue
    carried.push(entry.status === 'open' ? { ...entry, status: 'resolved' } : entry)
  }
  return { ok: true, ledger: { ...ledger, rounds: round, findings: [...carried, ...added] } }
}

export function nextEscalationModel(
  escalation: Readonly<Record<string, string>>,
  model: string,
): string | undefined {
  return escalation[model]
}

export function addRuling(ledger: Ledger, ruling: Ruling): Ledger {
  return { ...ledger, rulings: [...ledger.rulings, ruling] }
}

export function formatRulings(ledger: Ledger): string {
  return ledger.rulings
    .map((entry) => `Ruling: ${entry.what} — ${entry.why} — ${entry.cost} if wrong`)
    .join('\n')
}

function ledgerPath(repoRoot: string, ticket: string): string {
  return path.join(repoRoot, '.forge', 'review', `${ticket}.json`)
}

function loadLedger(repoRoot: string, ticket: string): Ledger {
  const file = ledgerPath(repoRoot, ticket)
  if (!existsSync(file)) return emptyLedger(ticket)
  const ledger: Ledger = JSON.parse(readFileSync(file, 'utf8'))
  return ledger
}

function saveLedger(repoRoot: string, ledger: Ledger): void {
  const file = ledgerPath(repoRoot, ledger.ticket)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`)
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]
  return value === undefined || (value.startsWith('--') && value !== '-') ? undefined : value
}

async function readFindingsInput(source: string): Promise<string> {
  return source === '-' ? await Bun.stdin.text() : readFileSync(source, 'utf8')
}

export async function run(argv: string[]): Promise<void> {
  try {
    const ticket = readFlagValue(argv, '--ticket')
    if (!ticket) {
      console.error(USAGE)
      process.exitCode = 2
      return
    }
    if (!/^[\w-]+$/.test(ticket)) {
      throw new ForgeConfigError(`forge review: invalid ticket id "${ticket}"`)
    }
    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) throw new ForgeConfigError('forge review: not inside a git repository')
    const { config } = await loadForgeConfigWithDefaults(repoRoot)
    const ledger = loadLedger(repoRoot, ticket)

    if (argv.includes('--rulings')) {
      console.log(formatRulings(ledger))
      return
    }

    if (argv.includes('--escalate')) {
      const model = readFlagValue(argv, '--model')
      if (!model) throw new ForgeConfigError('forge review: --escalate needs --model <current model>')
      const next = nextEscalationModel(config.models.escalation, model)
      if (!next) {
        console.error(`forge review: no escalation tier above "${model}"`)
        process.exitCode = 1
        return
      }
      console.log(next)
      return
    }

    const what = readFlagValue(argv, '--rule')
    if (what !== undefined) {
      const why = readFlagValue(argv, '--why')
      const cost = readFlagValue(argv, '--cost')
      if (!why || !cost) throw new ForgeConfigError('forge review: --rule needs --why and --cost')
      saveLedger(repoRoot, addRuling(ledger, { what, why, cost }))
      return
    }

    const source = readFlagValue(argv, '--findings')
    if (!source) {
      console.error(USAGE)
      process.exitCode = 2
      return
    }
    const changedFiles = (readFlagValue(argv, '--changed') ?? '').split(',').filter(Boolean)
    const findings = parseFindings(await readFindingsInput(source))
    const result = recordRound(ledger, findings, {
      changedFiles,
      reviewRounds: config.budgets.reviewRounds,
    })
    if (!result.ok) {
      console.error(result.reason)
      process.exitCode = 1
      return
    }
    saveLedger(repoRoot, result.ledger)
    const open = triageOrder(result.ledger.findings.filter((entry) => entry.status === 'open'))
    console.log(JSON.stringify({ round: result.ledger.rounds, open }, null, 2))
    process.exitCode = open.length > 0 ? 1 : 0
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message)
      process.exitCode = 2
      return
    }
    console.error(error)
    process.exitCode = 3
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
