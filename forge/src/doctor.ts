import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { loadForgeConfig, type TrackerKind } from './config'
import {
  checkDependencies,
  classifyClaudePluginProbe,
  classifyForgeAgentsProbe,
  createDependencyProbes,
  formatDependencyCheck,
  resolveBinaryOnPath,
  type DependencyCheck,
  type DependencyProbes,
} from './dependencies'
import { findTodoMarkersInDocsAgents } from './preflight'
import { computeAutoMaxLiveWorkers, readHostResources } from './resources'
import { listOccupiedSlots, resolveLegacySlotsDirectory } from './slots'

/**
 * `forge doctor` — a read-only fleet sweep. `forge preflight` answers "is
 * dispatch safe right now" for one repo you're standing in; this answers
 * "is `/forge` even set up correctly" across every repo you point it at
 * (e.g. `forge doctor ~/code/*`, shell-glob-expanded before this ever sees
 * argv). Never writes anything, never requires a git repo it's told to
 * check to exist — a path that isn't a repo, or a repo with no
 * `forge.config.json` at all, is a normal, reportable finding, not a crash.
 *
 * Also reports third-party dependency findings (see `dependencies.ts`): the
 * mattpocock-skills plugin and the `forge-worker`/`forge-reviewer` agents in
 * `~/.claude/agents/` (both global — one repo-independent finding each,
 * printed once for the whole sweep, not per repo) and, per repo, `gh` or the
 * Linear MCP server when that repo's `tracker.kind` calls for it. Unlike
 * `preflight`, an `unsatisfied` finding here never blocks anything — this
 * command only ever reports.
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
  /** This repo's declared tracker, straight from its config — `null` when
   * absent, which is also why tracker-scoped dependency findings below may
   * be empty even for a repo that actually needs `gh` or Linear. */
  readonly trackerKind: TrackerKind | null
  /** Repo-scoped dependency findings only (`gh`, Linear) — the plugin check
   * is global and printed once, not per repo; see {@link auditFleet}. */
  readonly dependencyFindings: readonly DependencyCheck[]
  /** Non-`null` only when this repo's `concurrency.maxLiveWorkers` is a
   * pinned number lower than what this HOST could auto-compute
   * (`resources.ts`'s `computeAutoMaxLiveWorkers`) — informational, never
   * part of {@link isReportClean}: a repo may have a deliberate reason to
   * pin it low (a heavier per-worker footprint than the default budget
   * assumes), so this is a nudge toward `"auto"`, not a finding to fix. */
  readonly maxLiveWorkersNote: string | null
}

/** A repo is clean if every check came back empty/false-negative — used both
 * to decide the process exit code and to print a one-line "OK" per repo
 * instead of an empty findings list. An `indeterminate` dependency finding
 * (e.g. `gh auth status` timing out) does not dirty a repo — it is something
 * that could not be checked, not something known to be wrong. */
export function isReportClean(report: RepoDoctorReport): boolean {
  if (!report.isGitRepo) return false
  if (!report.hasConfig) return false
  if (report.configError !== null) return false
  return (
    report.missingDocs.length === 0 &&
    report.todoMarkers.length === 0 &&
    report.selfCheckIssues.length === 0 &&
    report.dependencyFindings.every((check) => check.status !== 'unsatisfied')
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
  if (!(await resolveBinaryOnPath(firstToken))) {
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
 * partway through on one bad repo.
 *
 * `probes` is required, not optional: an optional parameter that silently
 * skips the dependency checks when omitted is exactly the kind of implicit
 * default this repo avoids, and it would let a test "forget" the stub and
 * accidentally shell out to real binaries. Callers needing no dependency
 * checks at all still pass `createDependencyProbes()` or a stub explicitly.
 */
export async function auditRepo(
  targetPath: string,
  probes: DependencyProbes,
): Promise<RepoDoctorReport> {
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
      trackerKind: null,
      dependencyFindings: [],
      maxLiveWorkersNote: null,
    }
  }

  const configResult = await loadForgeConfig(absolutePath)
  const hasConfig = configResult.status === 'ok'
  const configError = configResult.status === 'malformed' ? configResult.reason : null
  const trackerKind = configResult.status === 'ok' ? configResult.config.tracker.kind : null

  let maxLiveWorkersNote: string | null = null
  if (configResult.status === 'ok') {
    const pinned = configResult.config.concurrency.maxLiveWorkers
    if (pinned !== 'auto') {
      const autoCap = computeAutoMaxLiveWorkers(readHostResources())
      if (pinned < autoCap) {
        maxLiveWorkersNote = `concurrency.maxLiveWorkers is pinned at ${pinned}, below what this host could auto-compute (${autoCap}) — consider "auto" unless ${pinned} is deliberate`
      }
    }
  }

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

  // The plugin and forge-agents checks are repo-independent and printed once,
  // fleet-wide (see `main`) — only the tracker-scoped checks (gh, Linear)
  // belong to this repo.
  const dependencyFindings = hasConfig
    ? (
        await checkDependencies({ tracker: trackerKind, repoRoot: absolutePath, probes })
      ).filter(
        (check) =>
          check.dependency !== 'claude-plugin' &&
          check.dependency !== 'forge-agents' &&
          check.dependency !== 'tracker-kind',
      )
    : []

  return {
    path: absolutePath,
    isGitRepo: true,
    hasConfig,
    configError,
    missingDocs,
    todoMarkers,
    selfCheckIssues,
    trackerKind,
    dependencyFindings,
    maxLiveWorkersNote,
  }
}

function formatReport(report: RepoDoctorReport): string {
  if (!report.isGitRepo) {
    return `${report.path}: not a git repository — skipped`
  }
  if (isReportClean(report)) {
    return report.maxLiveWorkersNote
      ? `${report.path}: OK\n  - note: ${report.maxLiveWorkersNote}`
      : `${report.path}: OK`
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
  for (const check of report.dependencyFindings) {
    if (check.status === 'unsatisfied') {
      lines.push(`  - dependency: ${formatDependencyCheck(check, '    ')}`)
    } else if (check.status === 'indeterminate') {
      lines.push(`  - note: ${formatDependencyCheck(check, '    ')}`)
    }
  }
  return lines.join('\n')
}

export function parseDoctorArguments(argv: readonly string[]): string[] {
  return argv.filter((argument) => argument !== '--all')
}

/** Prints the plugin's own status once, fleet-wide — the alternative,
 * repeating it under every one of N repos, would both spam a large sweep and
 * hide that it is one global fact, not something particular to any one repo. */
function formatGlobalDependencyFinding(check: DependencyCheck): string | null {
  if (check.status === 'satisfied') return null
  const label = check.status === 'unsatisfied' ? 'dependency' : 'note'
  return `  - ${label}: ${formatDependencyCheck(check, '    ')}`
}

const BYTES_PER_GIB = 1024 ** 3

function formatGiB(bytes: number): string {
  return (bytes / BYTES_PER_GIB).toFixed(1)
}

/**
 * One line, once per sweep — this host's own numbers, the `"auto"` cap they
 * resolve to, and how many slots are actually held right now. The slot pool
 * is host-wide (see `slots.ts`), so this is never per-repo the way the rest
 * of the report is; a repo pinning below this cap gets its own
 * {@link RepoDoctorReport.maxLiveWorkersNote} instead.
 */
async function formatHostResourcesSummary(): Promise<string> {
  const resources = readHostResources()
  const autoCap = computeAutoMaxLiveWorkers(resources)
  const occupied = await listOccupiedSlots()
  const liveOccupied = occupied.filter((entry) => entry.verdict !== 'dead')

  const memPart =
    resources.memAvailableBytes !== null
      ? `${formatGiB(resources.memTotalBytes)} GiB RAM (${formatGiB(resources.memAvailableBytes)} GiB available)`
      : `${formatGiB(resources.memTotalBytes)} GiB RAM`

  const lines = [
    `Host resources: ${resources.cpuCount} vCPU, ${memPart} — "auto" would cap at ${autoCap}; ` +
      `${liveOccupied.length} slot(s) held host-wide right now.`,
  ]

  const legacyDirectory = await resolveLegacySlotsDirectory()
  if (legacyDirectory && existsSync(legacyDirectory) && readdirSync(legacyDirectory).length > 0) {
    lines.push(
      `  - note: ${legacyDirectory} still has entries — leftover from the pre-host-wide per-repo pool, safe to remove once no wave is running.`,
    )
  }

  return lines.join('\n')
}

/**
 * Advisories on `~/.claude/settings.json` keys that specifically affect
 * `/forge` — never blocking, never written by this CLI (only `install.sh`'s
 * guard-hook wiring touches that file). Personal keys (theme, OTEL, IDE
 * integration, other plugins) are deliberately out of scope: this checks
 * only what determines whether an unattended `/forge` run behaves, not the
 * user's own preferences.
 *
 * `model: "opusplan"` is what makes Phases 1-4 (plan mode) run on Opus and
 * Phase 6 onward run on Sonnet without the user touching `/model` — see the
 * README's "Models & effort" section. `permissions.defaultMode` and the
 * `git push`/`--force` deny rules are what let a wave run unattended without
 * stalling on a prompt or being able to overwrite the trunk branch.
 */
export function checkSettingsAdvisories(settings: unknown): readonly string[] {
  if (typeof settings !== 'object' || settings === null) return []
  const advisories: string[] = []
  const record = settings as Record<string, unknown>

  if (record.model !== 'opusplan') {
    advisories.push(
      'model is not "opusplan" — /forge assumes Opus plans (Phases 1-4) and Sonnet ' +
        'executes from Phase 6 on, with no /model switch needed; see the README\'s "Models & effort" section.',
    )
  }

  const permissions =
    typeof record.permissions === 'object' && record.permissions !== null
      ? (record.permissions as Record<string, unknown>)
      : {}
  const unattendedModes = new Set(['auto', 'acceptEdits', 'bypassPermissions'])
  if (typeof permissions.defaultMode !== 'string' || !unattendedModes.has(permissions.defaultMode)) {
    advisories.push(
      'permissions.defaultMode is not one that can run unattended (auto/acceptEdits/bypassPermissions) — ' +
        'a /forge wave will stall on a permission prompt with no one there to answer it.',
    )
  }

  const denyRules = Array.isArray(permissions.deny)
    ? permissions.deny.filter((rule): rule is string => typeof rule === 'string')
    : []
  if (!denyRules.some((rule) => /git push[^)]*\b(main|master)\b/.test(rule))) {
    advisories.push(
      'no permissions.deny rule blocks `git push * main|master` — recommended before running /forge unattended.',
    )
  }
  if (!denyRules.some((rule) => /git push[^)]*--force/.test(rule))) {
    advisories.push(
      'no permissions.deny rule blocks `git push --force *` — recommended before running /forge unattended.',
    )
  }

  return advisories
}

export const INSTALL_MANIFEST_RELATIVE_PATH = '.claude/forge/.install-manifest.json'

/**
 * Compares every file recorded in the installer's SHA-256 manifest against
 * what is on disk now. Returns one human-readable line per edited or missing
 * file; an absent or unreadable manifest yields no findings (nothing to compare).
 */
export async function findInstallDrift(homeDirectory: string): Promise<string[]> {
  let manifest: unknown
  try {
    manifest = JSON.parse(
      await readFile(path.join(homeDirectory, INSTALL_MANIFEST_RELATIVE_PATH), 'utf8'),
    )
  } catch {
    return []
  }
  if (typeof manifest !== 'object' || manifest === null) return []

  const findings: string[] = []
  for (const [relativePath, expectedHash] of Object.entries(manifest)) {
    const absolutePath = path.join(homeDirectory, relativePath)
    let currentHash: string
    try {
      currentHash = createHash('sha256')
        .update(await readFile(absolutePath))
        .digest('hex')
    } catch {
      findings.push(`~/${relativePath} is missing — re-run install.sh`)
      continue
    }
    if (currentHash !== expectedHash) {
      const pendingNote = existsSync(`${absolutePath}.new`)
        ? ` (new version waiting at ~/${relativePath}.new)`
        : ''
      findings.push(`~/${relativePath} was edited since install${pendingNote}`)
    }
  }
  return findings
}

async function readUserSettings(): Promise<unknown> {
  const file = Bun.file(path.join(os.homedir(), '.claude', 'settings.json'))
  if (!(await file.exists())) return null
  try {
    return await file.json()
  } catch {
    return null
  }
}

async function main(targets: readonly string[]): Promise<void> {
  const paths = targets.length > 0 ? targets : ['.']
  const probes = createDependencyProbes()

  const reports: RepoDoctorReport[] = []
  for (const target of paths) {
    reports.push(await auditRepo(target, probes))
  }

  for (const report of reports) {
    console.log(formatReport(report))
  }

  console.log(`\n${await formatHostResourcesSummary()}`)

  const globalPluginCheck = classifyClaudePluginProbe(await probes.claudePlugin())
  const globalForgeAgentsCheck = classifyForgeAgentsProbe(await probes.forgeAgents())
  const globalFindingLines = [globalPluginCheck, globalForgeAgentsCheck]
    .map(formatGlobalDependencyFinding)
    .filter((line): line is string => line !== null)
  if (globalFindingLines.length > 0) {
    console.log(`\nGlobal dependencies:\n${globalFindingLines.join('\n')}`)
  }

  const settingsAdvisories = checkSettingsAdvisories(await readUserSettings())
  if (settingsAdvisories.length > 0) {
    console.log(
      `\nSettings advisories (~/.claude/settings.json, never auto-fixed):\n${settingsAdvisories
        .map((advisory) => `  - ${advisory}`)
        .join('\n')}`,
    )
  }

  const installDrift = await findInstallDrift(os.homedir())
  if (installDrift.length > 0) {
    console.log(
      `\nInstall drift (informational — install.sh keeps your edits and writes <file>.new):\n${installDrift
        .map((line) => `  - ${line}`)
        .join('\n')}`,
    )
  }

  const cleanCount = reports.filter((report) => isReportClean(report)).length
  const gitRepoCount = reports.filter((report) => report.isGitRepo).length
  console.log(
    `\n${cleanCount}/${gitRepoCount} repos clean (${reports.length - gitRepoCount} skipped, not a git repo).`,
  )

  const exitClean =
    cleanCount === gitRepoCount &&
    globalPluginCheck.status !== 'unsatisfied' &&
    globalForgeAgentsCheck.status !== 'unsatisfied'
  process.exitCode = exitClean ? 0 : 1
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
