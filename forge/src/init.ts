import os from 'node:os'
import path from 'node:path'

import { DEFAULT_FORGE_CONFIG, resolveRepoRoot, type ForgeConfig, type TrackerKind } from './config'
import {
  checkDependencies,
  createDependencyProbes,
  findLinearMcpEntry,
  formatDependencyCheck,
} from './dependencies'
import { isObject } from './narrow'

/**
 * `forge init` — generates a repo's `forge.config.json` plus its
 * `docs/agents/{forge,issue-tracker,triage-labels,domain}.md` skeleton from
 * templates, so `/forge` can run in any repo without a human hand-writing
 * either from scratch. Autodetects what it safely can (package manager,
 * trunk branch, tracker kind); everything it can't infer (a shared singleton
 * resource, schema ownership, a Linear team key) is left as a `TODO(forge):`
 * marker in the generated docs — `forge preflight` refuses to dispatch while
 * one remains (see `preflight.ts`'s `checkForTodoMarkers`).
 *
 * Deliberately non-interactive: no readline prompts. A CLI tool asking
 * blocking questions on stdin doesn't compose with how `/forge` itself
 * (a Claude Code command) would drive this — if the command wants an actual
 * conversational interview before running `init`, it has that conversation
 * itself and either edits the generated file afterward or a future flag
 * feeds the answers in directly. `init` today's job is just: infer
 * everything inferable, mark everything else, never guess silently.
 */

export type PackageManagerKind =
  | 'bun'
  | 'pnpm'
  | 'npm'
  | 'go'
  | 'cargo'
  | 'python'
  | 'unknown'

export type { TrackerKind }

/**
 * Lockfile-based detection first (this repo's own convention, see the global
 * CLAUDE.md: "detect lockfile: bun.lock -> bun, pnpm-lock.yaml -> pnpm,
 * package-lock.json -> npm"), falling back to a non-JS ecosystem manifest,
 * and finally `'unknown'` (never guessed) rather than defaulting to `bun` —
 * unlike the "no lockfile in a JS repo" case that default applies to,
 * `'unknown'` here usually means this isn't a JS repo at all, and guessing
 * `bun` would produce a nonsensical `bun run <script>` in the generated
 * `commands.selfCheck`.
 */
export async function detectPackageManager(
  repoRoot: string,
): Promise<PackageManagerKind> {
  if (await Bun.file(path.join(repoRoot, 'bun.lock')).exists()) return 'bun'
  if (await Bun.file(path.join(repoRoot, 'bun.lockb')).exists()) return 'bun'
  if (await Bun.file(path.join(repoRoot, 'pnpm-lock.yaml')).exists())
    return 'pnpm'
  if (await Bun.file(path.join(repoRoot, 'package-lock.json')).exists())
    return 'npm'
  if (await Bun.file(path.join(repoRoot, 'package.json')).exists())
    return 'bun'
  if (await Bun.file(path.join(repoRoot, 'go.mod')).exists()) return 'go'
  if (await Bun.file(path.join(repoRoot, 'Cargo.toml')).exists())
    return 'cargo'
  if (await Bun.file(path.join(repoRoot, 'pyproject.toml')).exists())
    return 'python'
  return 'unknown'
}

/**
 * `origin/HEAD`'s symref is the correct source for "which branch is trunk" —
 * unlike `git branch --show-current`, it's unaffected by which branch this
 * checkout happens to have open right now (several repos in this fleet sit on
 * a feature branch most of the time). Returns `null` (never a guessed
 * default) when the symref is missing so the caller can fall back
 * explicitly and say so.
 */
export async function detectTrunk(repoRoot: string): Promise<string | null> {
  const result =
    await Bun.$`git -C ${repoRoot} symbolic-ref --short refs/remotes/origin/HEAD`
      .nothrow()
      .quiet()
  if (result.exitCode !== 0) return null
  const ref = result.stdout.toString().trim()
  const prefix = 'origin/'
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref || null
}

/**
 * Tracker *autodetection* asks a laxer question than the dependency check in
 * `dependencies.ts` does: a Linear entry that exists but is malformed still
 * means "this repo means to use Linear", which is what `init` needs to pick a
 * tracker kind — reporting that the entry is broken is the gate's job, not
 * detection's. Both share {@link findLinearMcpEntry} so the two can never
 * disagree about what counts as a Linear entry in the first place.
 */
export async function hasLinearMcpServer(repoRoot: string): Promise<boolean> {
  const file = Bun.file(path.join(repoRoot, '.mcp.json'))
  if (!(await file.exists())) return false
  let parsed: unknown
  try {
    parsed = await file.json()
  } catch {
    return false
  }
  return findLinearMcpEntry(parsed).kind !== 'absent'
}

/**
 * A GitHub remote existing and `gh` being authenticated is *not* by itself
 * evidence this repo actually uses GitHub Issues as its tracker — every
 * repo with `hasIssuesEnabled` (the GitHub default) would match. The real
 * signal is whether the repo has any issue at all, open or closed —
 * surveyed against this fleet, every repo with real issue-tracker usage had
 * several, and every repo without had exactly zero. `gh repo view` failing
 * outright (no remote, `gh` not authenticated) also reads as `false` here,
 * never thrown — this is a soft detection signal, not a required dependency.
 */
export async function hasGithubIssueUsage(repoRoot: string): Promise<boolean> {
  const view = await Bun.$`gh repo view --json hasIssuesEnabled -q .hasIssuesEnabled`
    .cwd(repoRoot)
    .nothrow()
    .quiet()
  if (view.exitCode !== 0) return false
  if (view.stdout.toString().trim() !== 'true') return false
  const list = await Bun.$`gh issue list --state all --limit 1 --json number`
    .cwd(repoRoot)
    .nothrow()
    .quiet()
  if (list.exitCode !== 0) return false
  try {
    const issues: unknown[] = JSON.parse(list.stdout.toString())
    return issues.length > 0
  } catch {
    return false
  }
}

/**
 * Priority order matches `forge.config.json`'s own design notes: a
 * networked tracker only counts if there's real evidence of it — a
 * configured Linear MCP server, or actual (not merely enabled) GitHub Issues
 * usage. Absent both, `local` is the safe default: no external dependency,
 * and `forge init` marks its issue-tracker doc as design-only until that
 * CLI surface exists (see `templates/issue-tracker-local.md.tpl`).
 */
export async function detectTrackerKind(repoRoot: string): Promise<TrackerKind> {
  if (await hasLinearMcpServer(repoRoot)) return 'linear'
  if (await hasGithubIssueUsage(repoRoot)) return 'github'
  return 'local'
}

/**
 * Reads `package.json`'s own `scripts` map (never invents a command this
 * repo doesn't already have) — prefers a single `check` alias if one exists
 * (this fleet's own convention for "format+lint+typecheck in one call"),
 * otherwise falls back to `lint`+`typecheck` run separately, otherwise an
 * empty list (never guessed) so the generated doc's TODO(forge) is honest
 * about there being nothing to autodetect.
 */
export async function detectJsSelfCheck(
  repoRoot: string,
  packageManager: 'bun' | 'pnpm' | 'npm',
): Promise<string[]> {
  const file = Bun.file(path.join(repoRoot, 'package.json'))
  if (!(await file.exists())) return []
  let parsed: unknown
  try {
    parsed = await file.json()
  } catch {
    return []
  }
  const scripts = isObject(parsed) && isObject(parsed.scripts) ? parsed.scripts : undefined
  if (!scripts) return []
  const runner = packageManager === 'npm' ? 'npm run' : `${packageManager} run`
  if (typeof scripts.check === 'string') return [`${runner} check`]
  const commands: string[] = []
  if (typeof scripts.lint === 'string') commands.push(`${runner} lint`)
  if (typeof scripts.typecheck === 'string')
    commands.push(`${runner} typecheck`)
  return commands
}

/**
 * Go has no `package.json`/`scripts` map to read, so this is a fixed,
 * near-universal pair (`go vet` is subsumed by `go build`'s own checks) plus
 * `make lint` only if this repo's own `Makefile` actually declares that
 * target — never invented for a repo with no `Makefile` at all.
 */
export async function detectGoSelfCheck(repoRoot: string): Promise<string[]> {
  const commands = ['go build ./...', 'go test ./...']
  const makefile = Bun.file(path.join(repoRoot, 'Makefile'))
  if (await makefile.exists()) {
    const content = await makefile.text()
    if (/^lint:/m.test(content)) commands.push('make lint')
  }
  return commands
}

export async function detectSelfCheck(
  repoRoot: string,
  packageManager: PackageManagerKind,
): Promise<string[]> {
  if (packageManager === 'bun' || packageManager === 'pnpm' || packageManager === 'npm') {
    return detectJsSelfCheck(repoRoot, packageManager)
  }
  if (packageManager === 'go') return detectGoSelfCheck(repoRoot)
  return []
}

/**
 * `nfkit` -> `NFK`, `le-petit-prince` -> `LEP`, `a` -> `A` (never empty —
 * `forge.config.json`'s own validation rejects an empty `idPrefix`, and
 * `TICKET` is the last-resort fallback for a basename with no letters at
 * all, e.g. a directory named only digits/punctuation).
 */
export function deriveIdPrefix(repoBasename: string): string {
  const letters = repoBasename.replaceAll(/[^a-zA-Z]/g, '').toUpperCase()
  if (letters.length === 0) return 'TICKET'
  return letters.slice(0, 3)
}

export type DetectedRepoInfo = {
  readonly repoName: string
  readonly packageManager: PackageManagerKind
  readonly trunk: string
  readonly trunkWasDetected: boolean
  readonly tracker: TrackerKind
  readonly idPrefix: string
  readonly selfCheck: readonly string[]
}

/**
 * Merges autodetected values into a fully-materialized {@link ForgeConfig} —
 * every field explicit, per `forge.config.json`'s own design (`forge init`
 * never writes a partial file relying on implicit defaults, even though the
 * loader would accept one).
 */
export function buildForgeConfig(detected: DetectedRepoInfo): ForgeConfig {
  return {
    version: 1,
    repo: { trunk: detected.trunk, remote: 'origin' },
    ticket: {
      idPattern: `^${detected.idPrefix}-\\d+$`,
      branchPrefix: detected.idPrefix.toLowerCase(),
    },
    concurrency: { ...DEFAULT_FORGE_CONFIG.concurrency },
    tracker: { kind: detected.tracker },
    /**
     * `gh` is seeded for a github repo so the written config shows the value
     * rather than leaving a reader to infer an implicit one. It is not
     * injected at runtime: `preflight` reads exactly what is on disk.
     */
    preflight: {
      requiredFiles: [],
      requiredCommands: detected.tracker === 'github' ? ['gh'] : [],
    },
    handoff: { ...DEFAULT_FORGE_CONFIG.handoff },
    pr: { ...DEFAULT_FORGE_CONFIG.pr },
    usage: { ...DEFAULT_FORGE_CONFIG.usage },
    models: DEFAULT_FORGE_CONFIG.models,
    review: DEFAULT_FORGE_CONFIG.review,
    budgets: { ...DEFAULT_FORGE_CONFIG.budgets },
    sizing: { ...DEFAULT_FORGE_CONFIG.sizing },
    map: { ...DEFAULT_FORGE_CONFIG.map },
    specs: { ...DEFAULT_FORGE_CONFIG.specs },
  }
}

/**
 * Prose-only `tracker` section (schema at `../schema/forge.config.schema.json`,
 * consumed by the `/forge` *command* per `docs/agents/issue-tracker.md` — see
 * `reference/tracker-<kind>.md` for the literal calls each shape below drives).
 * Never validated by `config.ts` — this CLI never reads it — but every default
 * here has to exist for `/forge` Phase 0 to have something to read at all:
 * without it, `tracker.kind` and `tracker.transitions` (the source of
 * non-negotiable #4 — "the coordinator writes a transition only where
 * `tracker.transitions` names it `coordinator`") are simply undefined, and a
 * freshly-`init`'d repo can't be dispatched against until someone hand-writes
 * this whole block first.
 *
 * `transitions`/`prReference` per kind mirror what
 * `reference/tracker-<kind>.md` and `templates/issue-tracker-<kind>.md.tpl`
 * already document as this repo's own convention — not invented here, only
 * finally written down where the command can actually read them:
 * - `linear`: `onStart` is the worker's own first write; `onPrOpen`/
 *   `onPrMerge` are `automatic` (Linear's GitHub integration moves the issue
 *   on PR open/merge on its own).
 * - `github`: `onStart` is the worker; `onPrOpen` is `coordinator` (a label
 *   swap — GitHub has no native workflow-state field); `onPrMerge` is
 *   `automatic` (the PR's own closing keyword closes the issue).
 * - `local`: no tracker-side automation exists yet (see
 *   `reference/tracker-local.md`), so both `onPrOpen` and `onPrMerge` are
 *   `coordinator` until a real `forge tracker` implementation lands.
 */
export function buildTrackerConfig(
  detected: DetectedRepoInfo,
): Record<string, unknown> {
  const readyLabel = 'ready-for-agent'
  const triageLabels = [
    'needs-triage',
    'needs-info',
    'ready-for-agent',
    'ready-for-human',
    'wontfix',
  ]

  if (detected.tracker === 'linear') {
    return {
      kind: 'linear',
      readyLabel,
      triageLabels,
      transitions: { onStart: 'worker', onPrOpen: 'automatic', onPrMerge: 'automatic' },
      prReference: 'Refs: {id}',
    }
  }

  if (detected.tracker === 'github') {
    return {
      kind: 'github',
      readyLabel,
      triageLabels,
      transitions: { onStart: 'worker', onPrOpen: 'coordinator', onPrMerge: 'automatic' },
      prReference: 'Closes #{number}',
      github: {
        priorityLabels: {},
        stateLabels: {
          todo: 'status:todo',
          'in-progress': 'status:in-progress',
          'in-review': 'status:in-review',
        },
      },
    }
  }

  return {
    kind: 'local',
    readyLabel,
    triageLabels,
    transitions: { onStart: 'worker', onPrOpen: 'coordinator', onPrMerge: 'coordinator' },
    prReference: 'Refs: {id}',
    local: { idPrefix: detected.idPrefix },
  }
}

/** Replaces every `{{TOKEN}}` in `template` with `vars.TOKEN`, throwing on an
 * unresolved token — a silently-unreplaced `{{...}}` in a generated doc is a
 * template bug, not something to ship. */
export function substituteTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replaceAll(/\{\{([A-Z_]+)\}\}/g, (_match, token: string) => {
    if (!(token in vars)) {
      throw new Error(`init: template references unknown placeholder {{${token}}}`)
    }
    return vars[token]!
  })
}

function selfCheckSection(selfCheck: readonly string[]): string {
  if (selfCheck.length === 0) {
    return (
      'TODO(forge): no self-check command was auto-detected for this repo — ' +
      'add one to `commands.selfCheck` in `forge.config.json` (a lint/typecheck ' +
      'alias, `go vet`, etc.), or delete this TODO if this repo genuinely has ' +
      "none and workers should judge for themselves."
    )
  }
  return `Auto-detected: ${selfCheck.map((command) => `\`${command}\``).join(', ')}.`
}

function monorepoSection(hasWorkspaces: boolean): string {
  if (hasWorkspaces) {
    return (
      'This repo has monorepo signals (a `pnpm-workspace.yaml`/`workspaces` field, ' +
      'or populated `packages/*`). TODO(forge): describe the workspace layout — ' +
      'which package(s) a typical ticket touches, and whether `CONTEXT.md`/' +
      '`docs/adr/` live at the repo root or per-package.'
    )
  }
  return (
    'Single-context repo (no monorepo signals detected: no ' +
    '`pnpm-workspace.yaml`, no `workspaces` field, no populated `packages/*`).\n\n' +
    '```\n/\n├── CONTEXT.md\n└── docs/adr/\n    ├── 0001-....md\n    └── 0002-....md\n```'
  )
}

async function detectHasWorkspaces(repoRoot: string): Promise<boolean> {
  if (await Bun.file(path.join(repoRoot, 'pnpm-workspace.yaml')).exists())
    return true
  const packageJson = Bun.file(path.join(repoRoot, 'package.json'))
  if (await packageJson.exists()) {
    try {
      const parsed: Record<string, unknown> = await packageJson.json()
      if (Array.isArray(parsed.workspaces) || typeof parsed.workspaces === 'object')
        return true
    } catch {
      /**
       * malformed package.json — treated as no workspaces, not fatal here
       */
    }
  }
  return false
}

function idExampleFor(idPrefix: string): string {
  return `${idPrefix}-1`
}

async function writeIfAbsentOrForced(
  filePath: string,
  content: string,
  force: boolean,
): Promise<'written' | 'skipped-exists'> {
  if (!force && (await Bun.file(filePath).exists())) return 'skipped-exists'
  await Bun.write(filePath, content)
  return 'written'
}

/**
 * Ignores forge's runtime state under `.forge/` (reviewer output such as
 * `review-<runId>.md`) for every tracker and un-ignores `.forge/tickets/`,
 * which the `local` tracker versions (its tickets are versioned; its mutable state under
 * `<git-common-dir>/forge/tracker/` never is — see
 * `templates/issue-tracker-local.md.tpl`). Refuses rather than silently
 * doing nothing useful if a broader existing rule (a bare `.forge` or
 * `.forge/` line) would still shadow the un-ignore — that combination needs
 * a human to resolve, not a guess about which line to remove.
 */
async function ensureForgeStateGitignore(repoRoot: string): Promise<string[]> {
  const gitignorePath = path.join(repoRoot, '.gitignore')
  const file = Bun.file(gitignorePath)
  const existing = (await file.exists()) ? await file.text() : ''
  const lines = existing.split('\n')
  const warnings: string[] = []

  const shadowingRule = lines.find(
    (line) => line.trim() === '.forge' || line.trim() === '.forge/',
  )
  if (shadowingRule) {
    warnings.push(
      `.gitignore already has a blanket "${shadowingRule.trim()}" rule that would ` +
        'shadow an un-ignore for .forge/tickets/ — resolve this by hand; the ' +
        'working pattern is `.forge/*` followed by `!.forge/tickets/`.',
    )
    return warnings
  }

  const alreadyPresent = lines.some((line) => line.trim() === '!.forge/tickets/')
  if (alreadyPresent) return warnings

  const block = ['', '# forge local tracker: tickets are versioned, tracker state is not.', '.forge/*', '!.forge/tickets/', '']
  const updated = existing.length > 0 ? `${existing.replace(/\n+$/, '\n')}${block.join('\n')}` : block.join('\n')
  await Bun.write(gitignorePath, updated)
  return warnings
}

/** Idempotent — `gh label create --force` overwrites color/description on an
 * existing label rather than erroring, matching the plan's "init is the only
 * point where it touches the remote" design. Failures (no `gh`, not
 * authenticated, insufficient permissions) are reported, never fatal to the
 * rest of `init`. */
async function ensureGithubStateLabels(repoRoot: string): Promise<string[]> {
  const labels: Array<{ name: string; color: string; description: string }> = [
    { name: 'status:todo', color: 'ededed', description: 'forge: not started' },
    {
      name: 'status:in-progress',
      color: 'fbca04',
      description: 'forge: a worker is on this',
    },
    {
      name: 'status:in-review',
      color: '0e8a16',
      description: 'forge: PR open, awaiting merge',
    },
  ]
  const failures: string[] = []
  for (const label of labels) {
    const result =
      // oxlint-disable-next-line eslint/no-await-in-loop -- git and gh calls stay sequential to keep output and side effects ordered
      await Bun.$`gh label create ${label.name} --color ${label.color} --description ${label.description} --force`
        .cwd(repoRoot)
        .nothrow()
        .quiet()
    if (result.exitCode !== 0) {
      failures.push(`${label.name}: ${result.stderr.toString().trim()}`)
    }
  }
  return failures
}

export type InitOptions = {
  readonly force: boolean
  readonly trackerOverride: TrackerKind | null
}

export function parseInitArguments(argv: readonly string[]): InitOptions {
  const force = argv.includes('--force')
  const trackerIndex = argv.indexOf('--tracker')
  const trackerValue = trackerIndex === -1 ? undefined : argv[trackerIndex + 1]
  if (
    trackerValue !== undefined &&
    trackerValue !== 'linear' &&
    trackerValue !== 'github' &&
    trackerValue !== 'local'
  ) {
    throw new Error(
      `forge init: --tracker must be one of linear|github|local, got "${trackerValue}"`,
    )
  }
  return { force, trackerOverride: trackerValue ?? null }
}

async function main(options: InitOptions): Promise<void> {
  const repoRoot = await resolveRepoRoot()
  if (!repoRoot) {
    console.error('forge init: not inside a git repository')
    process.exitCode = 2
    return
  }

  const configPath = path.join(repoRoot, 'forge.config.json')
  if (!options.force && (await Bun.file(configPath).exists())) {
    console.error(
      `forge init: ${configPath} already exists — pass --force to overwrite.`,
    )
    process.exitCode = 2
    return
  }

  const repoBasename = path.basename(repoRoot)
  const packageManager = await detectPackageManager(repoRoot)
  const detectedTrunk = await detectTrunk(repoRoot)
  const trunk = detectedTrunk ?? 'main'
  const tracker = options.trackerOverride ?? (await detectTrackerKind(repoRoot))
  const idPrefix = deriveIdPrefix(repoBasename)
  const selfCheck = await detectSelfCheck(repoRoot, packageManager)
  const hasWorkspaces = await detectHasWorkspaces(repoRoot)

  const detected: DetectedRepoInfo = {
    repoName: repoBasename,
    packageManager,
    trunk,
    trunkWasDetected: detectedTrunk !== null,
    tracker,
    idPrefix,
    selfCheck,
  }

  const config = buildForgeConfig(detected)
  const configJson = {
    /**
     * `~` is never expanded by a JSON Schema resolver or editor completion —
     * write the absolute path this CLI is actually installed at.
     */
    $schema: path.join(os.homedir(), '.claude', 'forge', 'schema', 'forge.config.schema.json'),
    '//':
      `Generated by \`forge init\` on ${new Date().toISOString().slice(0, 10)}. ` +
      'Every value below is either autodetected or a built-in default — review ' +
      'before relying on it, especially repo.trunk if it was not detected (see ' +
      'the summary this command printed). `commands` is prose-only (see the ' +
      'schema) — the /forge command reads it directly, this CLI never does.',
    ...config,
    tracker: buildTrackerConfig(detected),
    commands: { selfCheck: detected.selfCheck },
  }
  await Bun.write(configPath, `${JSON.stringify(configJson, null, 2)}\n`)

  const templatesDirectory = path.join(import.meta.dirname, '..', 'templates')
  const vars: Record<string, string> = {
    REPO_NAME: detected.repoName,
    TRACKER_KIND: detected.tracker,
    ID_PATTERN: config.ticket.idPattern,
    ID_PREFIX: detected.idPrefix,
    ID_EXAMPLE: idExampleFor(detected.idPrefix),
    BRANCH_PREFIX: config.ticket.branchPrefix,
    SELF_CHECK_SECTION: selfCheckSection(detected.selfCheck),
    MONOREPO_SECTION: monorepoSection(hasWorkspaces),
    DATE: new Date().toISOString().slice(0, 10),
  }

  const docsAgentsDirectory = path.join(repoRoot, 'docs', 'agents')
  await Bun.$`mkdir -p ${docsAgentsDirectory}`.quiet()

  const writes: Array<{ template: string; target: string }> = [
    { template: 'forge.md.tpl', target: 'forge.md' },
    { template: `issue-tracker-${detected.tracker}.md.tpl`, target: 'issue-tracker.md' },
    { template: `triage-labels-${detected.tracker}.md.tpl`, target: 'triage-labels.md' },
    { template: 'domain.md.tpl', target: 'domain.md' },
  ]

  const results: string[] = []
  for (const { template, target } of writes) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const templateContent = await Bun.file(
      path.join(templatesDirectory, template),
    ).text()
    const rendered = substituteTemplate(templateContent, vars)
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const outcome = await writeIfAbsentOrForced(
      path.join(docsAgentsDirectory, target),
      rendered,
      options.force,
    )
    results.push(`docs/agents/${target}: ${outcome}`)
  }

  const warnings: string[] = []
  if (!detectedTrunk) {
    warnings.push(
      `repo.trunk: could not resolve origin/HEAD's symref — defaulted to "main". ` +
        'Run `git remote set-head origin --auto` if that\'s wrong, then re-run ' +
        '`forge init --force`.',
    )
  }
  warnings.push(...(await ensureForgeStateGitignore(repoRoot)))
  if (detected.tracker === 'github') {
    const labelFailures = await ensureGithubStateLabels(repoRoot)
    if (labelFailures.length > 0) {
      warnings.push(
        `could not create tracker.github status labels (create them by hand): ${labelFailures.join('; ')}`,
      )
    }
  }

  const dependencyChecks = await checkDependencies({
    tracker,
    repoRoot,
    probes: createDependencyProbes(),
  })

  console.log(`forge init — ${repoRoot}`)
  console.log(`  package manager: ${packageManager}`)
  console.log(`  trunk: ${trunk}${detectedTrunk ? '' : ' (default — not detected)'}`)
  console.log(`  tracker: ${tracker}${options.trackerOverride ? ' (--tracker override)' : ''}`)
  console.log(`  ticket id prefix: ${idPrefix}`)
  console.log('')
  for (const line of results) console.log(`  ${line}`)
  if (warnings.length > 0) {
    console.log('\nWarnings:')
    for (const warning of warnings) console.log(`  - ${warning}`)
  }
  const dependencyNotes = dependencyChecks.filter((check) => check.status !== 'satisfied')
  const limitations = dependencyChecks
    .flatMap((check) =>
      check.status === 'satisfied' && check.limitation !== null ? [check.limitation] : [],
    )
  if (dependencyNotes.length > 0 || limitations.length > 0) {
    console.log('\nDependencies:')
    for (const check of dependencyNotes) {
      console.log(`  - ${formatDependencyCheck(check, '      ')}`)
    }
    for (const limitation of limitations) console.log(`  - note: ${limitation}`)
  }
  console.log(
    '\nNext: fill in every TODO(forge): marker under docs/agents/ — `forge preflight` refuses to dispatch while one remains.',
  )
}

export async function run(argv: string[]): Promise<void> {
  try {
    const options = parseInitArguments(argv)
    await main(options)
  } catch (error: unknown) {
    console.error(error)
    process.exitCode = process.exitCode ?? 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
