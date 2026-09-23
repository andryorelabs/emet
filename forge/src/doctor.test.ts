import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { DependencyProbes } from './dependencies'
import {
  auditRepo,
  checkSelfCheckCommand,
  checkSettingsAdvisories,
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
}

const healthyProbes: DependencyProbes = {
  claudePlugin: async () => ({ kind: 'listed', status: 'installed' }),
  githubCli: async () => ({ kind: 'authenticated' }),
  linearMcpServer: async () => ({ kind: 'declared', source: 'mcp-json' }),
  forgeAgents: async () => ({ kind: 'present' }),
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

  test('resolves a bare command whose binary is on PATH', async () => {
    expect(await checkSelfCheckCommand(repoRoot, 'go build ./...', null)).toBeNull()
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
    const report = await auditRepo(repoRoot, healthyProbes)
    expect(report.isGitRepo).toBe(false)
  })

  test('reports hasConfig: false for a git repo with no forge.config.json', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    const report = await auditRepo(repoRoot, healthyProbes)
    expect(report.isGitRepo).toBe(true)
    expect(report.hasConfig).toBe(false)
    expect(report.configError).toBeNull()
    expect(isReportClean(report)).toBe(false)
  })

  test('reports a configError for malformed JSON, without crashing', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    await Bun.write(path.join(repoRoot, 'forge.config.json'), '{not json')
    const report = await auditRepo(repoRoot, healthyProbes)
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

    const report = await auditRepo(repoRoot, healthyProbes)
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

    const report = await auditRepo(repoRoot, healthyProbes)
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
    const report = await auditRepo(repoRoot, healthyProbes)
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
    const report = await auditRepo(repoRoot, probes)
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
    const report = await auditRepo(repoRoot, probes)
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
    const report = await auditRepo(repoRoot, probes)
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
