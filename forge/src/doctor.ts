import { existsSync } from 'node:fs'
import path from 'node:path'

import { loadForgeConfig } from './config'
import { findTodoMarkersInDocsAgents } from './preflight'

/**
 * `forge doctor` — a read-only fleet sweep. `forge preflight` answers "is
 * dispatch safe right now" for one repo you're standing in; this answers
 * "is `/forge` even set up correctly" across every repo you point it at
 * (e.g. `forge doctor ~/code/*`, shell-glob-expanded before this ever sees
 * argv). Never writes anything, never requires a git repo it's told to
 * check to exist — a path that isn't a repo, or a repo with no
 * `forge.config.json` at all, is a normal, reportable finding, not a crash.
 */

const REQUIRED_DOCS = ['forge.md', 'issue-tracker.md', 'triage-labels.md', 'domain.md']

export type RepoDoctorReport = {
  readonly path: string
  readonly isGitRepo: boolean
  readonly hasConfig: boolean
  readonly configError: string | null
  readonly missingDocs: readonly string[]
  readonly todoMarkers: readonly string[]
  readonly selfCheckIssues: readonly string[]
}

/** A repo is clean if every check came back empty/false-negative — used both
 * to decide the process exit code and to print a one-line "OK" per repo
 * instead of an empty findings list. */
export function isReportClean(report: RepoDoctorReport): boolean {
  if (!report.isGitRepo) return false
  if (!report.hasConfig) return false
  if (report.configError !== null) return false
  return (
    report.missingDocs.length === 0 &&
    report.todoMarkers.length === 0 &&
    report.selfCheckIssues.length === 0
  )
}

/**
 * Which of the four `docs/agents/*.md` files `forge init` generates are
 * missing at this repo root — order matches {@link REQUIRED_DOCS}, not
 * filesystem order, so a report's list is stable across runs.
 */
export function findMissingDocs(existing: ReadonlySet<string>): string[] {
  return REQUIRED_DOCS.filter((doc) => !existing.has(doc))
}

/**
 * A `commands.selfCheck` entry "resolves" if either it's a `<packageManager>
 * run <script>` invocation and `package.json` actually declares that
 * script, or its first token is a binary genuinely on `PATH` (checked via
 * Bun Shell's built-in `which` — Bun's shell is its own minimal
 * implementation, not a real POSIX shell, so the usual `command -v` builtin
 * isn't available inside a `Bun.$` template). A command that doesn't parse
 * as either
 * shape is reported as unresolved rather than silently assumed fine —
 * `forge init` never writes anything this check wouldn't recognize, so an
 * unrecognized shape here means a human hand-edited `commands.selfCheck`
 * into something `forge doctor` can't verify, which is itself worth
 * surfacing.
 */
export async function checkSelfCheckCommand(
  repoRoot: string,
  command: string,
  packageManagerScripts: ReadonlySet<string> | null,
): Promise<string | null> {
  const runMatch = /^(?:bun|pnpm|npm) run (\S+)/.exec(command)
  if (runMatch) {
    const script = runMatch[1]!
    if (packageManagerScripts === null) {
      return `"${command}" looks like a package-manager script, but this repo has no readable package.json`
    }
    if (!packageManagerScripts.has(script)) {
      return `"${command}" references package.json script "${script}", which doesn't exist`
    }
    return null
  }

  const firstToken = command.trim().split(/\s+/)[0]
  if (!firstToken) return `empty command in commands.selfCheck`
  const result = await Bun.$`which ${firstToken}`.cwd(repoRoot).nothrow().quiet()
  if (result.exitCode !== 0) {
    return `"${command}": "${firstToken}" is not on PATH`
  }
  return null
}

async function readPackageManagerScripts(
  repoRoot: string,
): Promise<ReadonlySet<string> | null> {
  const file = Bun.file(path.join(repoRoot, 'package.json'))
  if (!(await file.exists())) return null
  try {
    const parsed = (await file.json()) as Record<string, unknown>
    const scripts = parsed.scripts
    if (typeof scripts !== 'object' || scripts === null) return new Set()
    return new Set(Object.keys(scripts as Record<string, unknown>))
  } catch {
    return null
  }
}

async function readSelfCheckCommands(repoRoot: string): Promise<string[]> {
  const file = Bun.file(path.join(repoRoot, 'forge.config.json'))
  if (!(await file.exists())) return []
  try {
    const parsed = (await file.json()) as Record<string, unknown>
    const commands = parsed.commands
    if (typeof commands !== 'object' || commands === null) return []
    const selfCheck = (commands as Record<string, unknown>).selfCheck
    if (!Array.isArray(selfCheck)) return []
    return selfCheck.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

async function isGitRepo(targetPath: string): Promise<boolean> {
  const result = await Bun.$`git -C ${targetPath} rev-parse --show-toplevel`
    .nothrow()
    .quiet()
  return result.exitCode === 0
}

/** Audits one path. Never throws — every failure mode (not a repo, no
 * config, malformed config, missing docs) is a field on the returned
 * report, not an exception, so a fleet sweep over many paths never aborts
 * partway through on one bad repo. */
export async function auditRepo(targetPath: string): Promise<RepoDoctorReport> {
  const absolutePath = path.resolve(targetPath)

  if (!(await isGitRepo(absolutePath))) {
    return {
      path: absolutePath,
      isGitRepo: false,
      hasConfig: false,
      configError: null,
      missingDocs: [],
      todoMarkers: [],
      selfCheckIssues: [],
    }
  }

  const configResult = await loadForgeConfig(absolutePath)
  const hasConfig = configResult.status === 'ok'
  const configError = configResult.status === 'malformed' ? configResult.reason : null

  const docsAgentsDirectory = path.join(absolutePath, 'docs', 'agents')
  const existingDocs = new Set(
    REQUIRED_DOCS.filter((doc) => existsSync(path.join(docsAgentsDirectory, doc))),
  )
  const missingDocs = existsSync(docsAgentsDirectory) ? findMissingDocs(existingDocs) : REQUIRED_DOCS

  const todoMarkers = await findTodoMarkersInDocsAgents(absolutePath)

  const selfCheckCommands = configResult.status === 'ok' ? await readSelfCheckCommands(absolutePath) : []
  const packageManagerScripts = await readPackageManagerScripts(absolutePath)
  const selfCheckIssues: string[] = []
  for (const command of selfCheckCommands) {
    const issue = await checkSelfCheckCommand(absolutePath, command, packageManagerScripts)
    if (issue) selfCheckIssues.push(issue)
  }

  return {
    path: absolutePath,
    isGitRepo: true,
    hasConfig,
    configError,
    missingDocs,
    todoMarkers,
    selfCheckIssues,
  }
}

function formatReport(report: RepoDoctorReport): string {
  if (!report.isGitRepo) {
    return `${report.path}: not a git repository — skipped`
  }
  if (isReportClean(report)) {
    return `${report.path}: OK`
  }

  const lines = [`${report.path}:`]
  if (!report.hasConfig && report.configError === null) {
    lines.push('  - no forge.config.json — run "forge init" here')
  }
  if (report.configError !== null) {
    lines.push(`  - forge.config.json is malformed: ${report.configError}`)
  }
  for (const doc of report.missingDocs) {
    lines.push(`  - missing docs/agents/${doc}`)
  }
  for (const marker of report.todoMarkers) {
    lines.push(`  - ${marker}`)
  }
  for (const issue of report.selfCheckIssues) {
    lines.push(`  - commands.selfCheck: ${issue}`)
  }
  return lines.join('\n')
}

export function parseDoctorArguments(argv: readonly string[]): string[] {
  return argv.filter((argument) => argument !== '--all')
}

async function main(targets: readonly string[]): Promise<void> {
  const paths = targets.length > 0 ? targets : ['.']
  const reports: RepoDoctorReport[] = []
  for (const target of paths) {
    reports.push(await auditRepo(target))
  }

  for (const report of reports) {
    console.log(formatReport(report))
  }

  const cleanCount = reports.filter((report) => isReportClean(report)).length
  const gitRepoCount = reports.filter((report) => report.isGitRepo).length
  console.log(
    `\n${cleanCount}/${gitRepoCount} repos clean (${reports.length - gitRepoCount} skipped, not a git repo).`,
  )

  process.exitCode = cleanCount === gitRepoCount ? 0 : 1
}

export async function run(argv: string[]): Promise<void> {
  try {
    const targets = parseDoctorArguments(argv)
    await main(targets)
  } catch (error: unknown) {
    console.error(error)
    process.exitCode = process.exitCode ?? 3
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
