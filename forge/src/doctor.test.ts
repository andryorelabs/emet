import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { DependencyProbes } from './dependencies'
import {
  auditRepo,
  checkExternalCliFlags,
  checkTrackerTarget,
  createEnvironmentProbes,
  checkWorktreeForkBase,
  findMissingFlags,
  normalizeGithubSlug,
  type EnvironmentProbes,
  checkSelfCheckCommand,
  checkSettingsAdvisories,
  findInstallDrift,
  findMissingDocs,
  isReportClean,
  parseDoctorArguments,
  type RepoDoctorReport,
} from './doctor'

const cleanReport: RepoDoctorReport = {
  path: '/repo',
  isGitRepo: true,
  hasConfig: true,
  configError: null,
  missingDocs: [],
  todoMarkers: [],
  selfCheckIssues: [],
  trackerKind: null,
  dependencyFindings: [],
  maxLiveWorkersNote: null,
  environmentFindings: [],
}

const healthyProbes: DependencyProbes = {
  claudePlugin: async () => ({ kind: 'listed', status: 'installed' }),
  githubCli: async () => ({ kind: 'authenticated' }),
  linearMcpServer: async () => ({ kind: 'declared', source: 'mcp-json' }),
  forgeAgents: async () => ({ kind: 'present' }),
}

const healthyEnvironment: EnvironmentProbes = {
  helpText: async (command) => {
    const joined = command.join(' ')
    if (joined.startsWith('gh issue view')) return '      --json fields   Output JSON'
    if (joined.startsWith('gh issue edit')) return '      --add-label name\n      --remove-label name'
    if (joined.startsWith('gh repo view')) return '      --json fields'
    if (joined === 'claude agents --help') return '  --json   Print active sessions'
    return '  --bg, --background   Start in background'
  },
  ghRepoNameWithOwner: async () => 'Owner/repo',
  remoteUrl: async () => 'git@github.com:owner/repo.git',
  resolveRef: async () => 'a'.repeat(40),
  worktreeBaseRef: async () => null,
}

describe('isReportClean', () => {
  test('clean when every check is empty', () => {
    expect(isReportClean(cleanReport)).toBe(true)
  })

  test('not clean when not a git repo', () => {
    expect(isReportClean({ ...cleanReport, isGitRepo: false })).toBe(false)
  })

  test('not clean when config is missing', () => {
    expect(isReportClean({ ...cleanReport, hasConfig: false })).toBe(false)
  })

  test('not clean when config is malformed', () => {
    expect(isReportClean({ ...cleanReport, configError: 'bad json' })).toBe(false)
  })

  test('not clean with a missing doc', () => {
    expect(isReportClean({ ...cleanReport, missingDocs: ['domain.md'] })).toBe(false)
  })

  test('not clean with a TODO marker', () => {
    expect(isReportClean({ ...cleanReport, todoMarkers: ['forge.md:1: TODO(forge): x'] })).toBe(
      false,
    )
  })

  test('not clean with a selfCheck issue', () => {
    expect(isReportClean({ ...cleanReport, selfCheckIssues: ['bad command'] })).toBe(false)
  })

  test('not clean with an unsatisfied dependency finding', () => {
    expect(
      isReportClean({
        ...cleanReport,
        dependencyFindings: [
          {
            dependency: 'github-cli',
            status: 'unsatisfied',
            summary: 'gh not on PATH',
            remedy: [],
            limitation: null,
          },
        ],
      }),
    ).toBe(false)
  })

  test('an indeterminate dependency finding does not dirty the repo', () => {
    expect(
      isReportClean({
        ...cleanReport,
        dependencyFindings: [
          {
            dependency: 'github-cli',
            status: 'indeterminate',
            summary: 'gh auth status timed out',
            remedy: [],
            limitation: null,
          },
        ],
      }),
    ).toBe(true)
  })
})

describe('findMissingDocs', () => {
  test('reports every doc absent from the given set, in canonical order', () => {
    expect(findMissingDocs(new Set(['forge.md']))).toEqual([
      'issue-tracker.md',
      'triage-labels.md',
      'domain.md',
    ])
  })

  test('empty when all four are present', () => {
    expect(
      findMissingDocs(new Set(['forge.md', 'issue-tracker.md', 'triage-labels.md', 'domain.md'])),
    ).toEqual([])
  })
})

describe('parseDoctorArguments', () => {
  test('strips --all, keeps positional paths', () => {
    expect(parseDoctorArguments(['--all', '/a', '/b'])).toEqual(['/a', '/b'])
  })

  test('no paths at all', () => {
    expect(parseDoctorArguments(['--all'])).toEqual([])
  })
})

describe('checkSelfCheckCommand', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-doctor-test-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test('resolves a "<pm> run <script>" command whose script exists', async () => {
    const scripts = new Set(['check'])
    expect(await checkSelfCheckCommand(repoRoot, 'bun run check', scripts)).toBeNull()
  })

  test('flags a "<pm> run <script>" command whose script does not exist', async () => {
    const scripts = new Set(['check'])
    const issue = await checkSelfCheckCommand(repoRoot, 'bun run lint', scripts)
    expect(issue).toContain('lint')
    expect(issue).toContain("doesn't exist")
  })

  test('flags a package-manager run command when there is no package.json at all', async () => {
    const issue = await checkSelfCheckCommand(repoRoot, 'pnpm run check', null)
    expect(issue).toContain('no readable package.json')
  })

  describe('with a package manager directory option', () => {
    beforeEach(() => {
      mkdirSync(path.join(repoRoot, 'sub'))
      writeFileSync(
        path.join(repoRoot, 'sub', 'package.json'),
        JSON.stringify({ scripts: { check: 'true' } }),
      )
    })

    test.each([
      'bun run --cwd sub check',
      'bun run --cwd=sub check',
      'npm --prefix sub run check',
      'pnpm -C sub run check',
      'pnpm --dir sub run check',
    ])('resolves "%s" against the subdirectory package.json', async (command) => {
      expect(await checkSelfCheckCommand(repoRoot, command, null)).toBeNull()
    })

    test('flags a script missing from the subdirectory package.json', async () => {
      const issue = await checkSelfCheckCommand(repoRoot, 'bun run --cwd sub lint', null)
      expect(issue).toContain("script \"lint\", which doesn't exist")
    })

    test('flags a directory with no package.json', async () => {
      const issue = await checkSelfCheckCommand(repoRoot, 'bun run --cwd missing check', null)
      expect(issue).toContain('"missing" has no readable package.json')
    })
  })

  test('resolves a bare command whose binary is on PATH', async () => {
    expect(await checkSelfCheckCommand(repoRoot, 'git status --short', null)).toBeNull()
  })

  test('flags a bare command whose binary is not on PATH', async () => {
    const issue = await checkSelfCheckCommand(
      repoRoot,
      'definitely-not-a-real-binary-xyz --flag',
      null,
    )
    expect(issue).toContain('not on PATH')
  })
})

describe('auditRepo', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-doctor-test-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test('reports isGitRepo: false for a plain directory', async () => {
    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.isGitRepo).toBe(false)
  })

  test('reports hasConfig: false for a git repo with no forge.config.json', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.isGitRepo).toBe(true)
    expect(report.hasConfig).toBe(false)
    expect(report.configError).toBeNull()
    expect(isReportClean(report)).toBe(false)
  })

  test('reports a configError for malformed JSON, without crashing', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(path.join(repoRoot, 'forge.config.json'), '{not json')
    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.hasConfig).toBe(false)
    expect(report.configError).toContain('not valid JSON')
  })

  test('a fully-initialized repo with no TODO markers and a resolvable selfCheck is clean', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
        commands: { selfCheck: ['bun run check'] },
      }),
    )
    await Bun.write(path.join(repoRoot, 'package.json'), JSON.stringify({ scripts: { check: 'x' } }))
    const docsAgentsDirectory = path.join(repoRoot, 'docs', 'agents')
    await Bun.$`mkdir -p ${docsAgentsDirectory}`.quiet()
    for (const doc of ['forge.md', 'issue-tracker.md', 'triage-labels.md', 'domain.md']) {
      await Bun.write(path.join(docsAgentsDirectory, doc), '# all set, no markers here\n')
    }

    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.isGitRepo).toBe(true)
    expect(report.hasConfig).toBe(true)
    expect(report.missingDocs).toEqual([])
    expect(report.todoMarkers).toEqual([])
    expect(report.selfCheckIssues).toEqual([])
    expect(isReportClean(report)).toBe(true)
  })

  test('flags a leftover TODO(forge) marker and a missing doc together', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
      }),
    )
    const docsAgentsDirectory = path.join(repoRoot, 'docs', 'agents')
    await Bun.$`mkdir -p ${docsAgentsDirectory}`.quiet()
    await Bun.write(
      path.join(docsAgentsDirectory, 'forge.md'),
      'TODO(forge): fill this in\n',
    )

    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.hasConfig).toBe(true)
    expect(report.missingDocs).toEqual(['issue-tracker.md', 'triage-labels.md', 'domain.md'])
    expect(report.todoMarkers).toEqual(['docs/agents/forge.md:1: TODO(forge): fill this in'])
    expect(isReportClean(report)).toBe(false)
  })

  test('reads tracker.kind from the config and reports it', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
        tracker: { kind: 'github' },
      }),
    )
    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.trackerKind).toBe('github')
  })

  test('a github tracker with gh unauthenticated produces a dependency finding', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
        tracker: { kind: 'github' },
      }),
    )
    const probes: DependencyProbes = {
      ...healthyProbes,
      githubCli: async () => ({ kind: 'unauthenticated' }),
    }
    const report = await auditRepo(repoRoot, probes, healthyEnvironment)
    expect(report.dependencyFindings.map((check) => check.dependency)).toEqual(['github-cli'])
    expect(isReportClean(report)).toBe(false)
  })

  test('a linear tracker with no server declared produces a dependency finding', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
        tracker: { kind: 'linear' },
      }),
    )
    const probes: DependencyProbes = {
      ...healthyProbes,
      linearMcpServer: async () => ({ kind: 'not-declared', searchedAllScopes: true }),
    }
    const report = await auditRepo(repoRoot, probes, healthyEnvironment)
    expect(report.dependencyFindings.map((check) => check.dependency)).toEqual(['linear-mcp-server'])
    expect(isReportClean(report)).toBe(false)
  })

  test('no tracker.kind declared produces no tracker-scoped dependency findings', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
      }),
    )
    const probes: DependencyProbes = {
      ...healthyProbes,
      githubCli: async () => ({ kind: 'unauthenticated' }),
    }
    const report = await auditRepo(repoRoot, probes, healthyEnvironment)
    expect(report.trackerKind).toBeNull()
    expect(report.dependencyFindings).toEqual([])
  })
})

const readySettings = {
  model: 'opusplan',
  permissions: {
    defaultMode: 'auto',
    deny: ['Bash(git push * main)', 'Bash(git push --force *)'],
  },
}

describe('findMissingFlags', () => {
  test('matches a whole flag, not a longer flag sharing its prefix', () => {
    expect(findMissingFlags('  --json-extra  x', ['--json'])).toEqual(['--json'])
    expect(findMissingFlags('  --bg, --background  x', ['--bg'])).toEqual([])
  })
})

describe('checkExternalCliFlags', () => {
  test('clean when every required flag is documented', async () => {
    expect(await checkExternalCliFlags(healthyEnvironment)).toEqual([])
  })

  test('reports a command whose --help lost a flag', async () => {
    const findings = await checkExternalCliFlags({
      ...healthyEnvironment,
      helpText: async (command) =>
        command.join(' ') === 'claude agents --help'
          ? 'nothing here'
          : healthyEnvironment.helpText(command),
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('claude agents')
    expect(findings[0]).toContain('--json')
  })

  test('reports a command that cannot be run', async () => {
    const findings = await checkExternalCliFlags({ ...healthyEnvironment, helpText: async () => null })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0]).toContain('could not be run')
  })
})

describe('normalizeGithubSlug', () => {
  test('handles ssh and https remotes', () => {
    expect(normalizeGithubSlug('git@github.com:Owner/Repo.git')).toBe('owner/repo')
    expect(normalizeGithubSlug('https://github.com/Owner/Repo')).toBe('owner/repo')
  })
  test('null for a non-github remote', () => {
    expect(normalizeGithubSlug('git@gitlab.com:a/b.git')).toBeNull()
  })
})

describe('checkTrackerTarget', () => {
  const noLinear = { linearTeam: undefined }
  test('github: matching repo is fine, case-insensitively', () => {
    expect(
      checkTrackerTarget({
        kind: 'github',
        ghRepo: 'Owner/Repo',
        remoteUrl: 'git@github.com:owner/repo.git',
        ...noLinear,
      }),
    ).toEqual([])
  })
  test('github: mismatch is reported with both slugs', () => {
    const findings = checkTrackerTarget({
      kind: 'github',
      ghRepo: 'other/fork',
      remoteUrl: 'git@github.com:owner/repo.git',
      ...noLinear,
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('other/fork')
    expect(findings[0]).toContain('owner/repo')
  })
  test('github: undeterminable repo is not a finding', () => {
    expect(checkTrackerTarget({ kind: 'github', ghRepo: null, remoteUrl: 'x', ...noLinear })).toEqual([])
  })
  test('linear: missing or blank team is reported', () => {
    expect(checkTrackerTarget({ kind: 'linear', ghRepo: null, remoteUrl: null, ...noLinear })).toHaveLength(1)
    expect(checkTrackerTarget({ kind: 'linear', ghRepo: null, remoteUrl: null, linearTeam: ' ' })).toHaveLength(1)
  })
  test('linear: declared team is fine; local tracker has no target', () => {
    expect(checkTrackerTarget({ kind: 'linear', ghRepo: null, remoteUrl: null, linearTeam: 'ENG' })).toEqual([])
    expect(checkTrackerTarget({ kind: 'local', ghRepo: null, remoteUrl: null, ...noLinear })).toEqual([])
  })
})

describe('checkWorktreeForkBase', () => {
  const base = {
    coordinatorHead: 'a'.repeat(40),
    harnessBase: 'b'.repeat(40),
    baseRefSetting: null,
    harnessBaseRef: 'origin/main',
  }
  test('equal SHAs are fine', () => {
    expect(checkWorktreeForkBase({ ...base, harnessBase: base.coordinatorHead })).toEqual([])
  })
  test('divergence reports the worktree.baseRef fix', () => {
    const findings = checkWorktreeForkBase(base)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('baseRef')
  })
  test('baseRef: head makes divergence irrelevant', () => {
    expect(checkWorktreeForkBase({ ...base, baseRefSetting: 'head' })).toEqual([])
  })
  test('unresolvable refs are not a finding', () => {
    expect(checkWorktreeForkBase({ ...base, harnessBase: null })).toEqual([])
  })
})

describe('auditRepo environment findings', () => {
  let repoRoot: string
  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-doctor-env-'))
  })
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  async function initRepo(tracker: object | undefined): Promise<void> {
    await Bun.$`git init --quiet`.cwd(repoRoot).quiet()
    await Bun.write(
      path.join(repoRoot, 'forge.config.json'),
      JSON.stringify({
        version: 1,
        repo: { trunk: 'main', remote: 'origin' },
        ticket: { idPattern: '^X-\\d+$', branchPrefix: 'x' },
        ...(tracker ? { tracker } : {}),
      }),
    )
  }

  test('a linear repo without tracker.team is dirty', async () => {
    await initRepo({ kind: 'linear' })
    const report = await auditRepo(repoRoot, healthyProbes, healthyEnvironment)
    expect(report.environmentFindings.join('\n')).toContain('tracker.team')
    expect(isReportClean(report)).toBe(false)
  })

  test('a diverged fork base is dirty', async () => {
    await initRepo(undefined)
    const report = await auditRepo(repoRoot, healthyProbes, {
      ...healthyEnvironment,
      resolveRef: async (_root, ref) => (ref === 'HEAD' ? 'a'.repeat(40) : 'b'.repeat(40)),
    })
    expect(report.environmentFindings.join('\n')).toContain('baseRef')
    expect(isReportClean(report)).toBe(false)
  })
})

describe('checkSettingsAdvisories', () => {
  test('no advisories when every forge-relevant key is already set', () => {
    expect(checkSettingsAdvisories(readySettings)).toEqual([])
  })

  test('no settings.json at all produces no advisories to act on', () => {
    expect(checkSettingsAdvisories(null)).toEqual([])
  })

  test('flags a model other than opusplan', () => {
    const advisories = checkSettingsAdvisories({ ...readySettings, model: 'sonnet' })
    expect(advisories.some((advisory) => advisory.includes('opusplan'))).toBe(true)
  })

  test('flags a permissions.defaultMode that cannot run unattended', () => {
    const advisories = checkSettingsAdvisories({
      ...readySettings,
      permissions: { ...readySettings.permissions, defaultMode: 'default' },
    })
    expect(advisories.some((advisory) => advisory.includes('permission prompt'))).toBe(true)
  })

  test('flags a missing deny rule for pushing to main/master', () => {
    const advisories = checkSettingsAdvisories({
      ...readySettings,
      permissions: { ...readySettings.permissions, deny: ['Bash(git push --force *)'] },
    })
    expect(advisories.some((advisory) => advisory.includes('main|master'))).toBe(true)
  })

  test('flags a missing deny rule for force-pushing', () => {
    const advisories = checkSettingsAdvisories({
      ...readySettings,
      permissions: { ...readySettings.permissions, deny: ['Bash(git push * main)'] },
    })
    expect(advisories.some((advisory) => advisory.includes('--force'))).toBe(true)
  })
})

describe('findInstallDrift', () => {
  let home: string
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'forge-drift-'))
    mkdirSync(path.join(home, '.claude/forge'), { recursive: true })
    mkdirSync(path.join(home, '.claude/agents'), { recursive: true })
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  function writeManifest(entries: Record<string, string>) {
    writeFileSync(path.join(home, '.claude/forge/.install-manifest.json'), JSON.stringify(entries))
  }

  test('no manifest means no findings', async () => {
    expect(await findInstallDrift(home)).toEqual([])
  })

  test('unchanged files are not drift', async () => {
    writeFileSync(path.join(home, '.claude/agents/a.md'), 'original')
    writeManifest({ '.claude/agents/a.md': sha('original') })
    expect(await findInstallDrift(home)).toEqual([])
  })

  test('reports an edited file and a pending .new', async () => {
    writeFileSync(path.join(home, '.claude/agents/a.md'), 'edited')
    writeFileSync(path.join(home, '.claude/agents/a.md.new'), 'upstream')
    writeManifest({ '.claude/agents/a.md': sha('original') })
    const findings = await findInstallDrift(home)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/a.md was edited')
    expect(findings[0]).toContain('a.md.new')
  })

  test('reports a missing file', async () => {
    writeManifest({ '.claude/agents/gone.md': sha('x') })
    expect((await findInstallDrift(home))[0]).toContain('missing')
  })
})

describe('createEnvironmentProbes', () => {
  test('helpText reports a missing binary as unrunnable, not as help text', async () => {
    const probes = createEnvironmentProbes()
    expect(await probes.helpText(['forge-no-such-binary-xyz', '--help'])).toBeNull()
  })
})
