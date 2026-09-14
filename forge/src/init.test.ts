import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildForgeConfig,
  buildTrackerConfig,
  deriveIdPrefix,
  detectGoSelfCheck,
  detectJsSelfCheck,
  detectPackageManager,
  detectTrackerKind,
  detectTrunk,
  hasLinearMcpServer,
  parseInitArguments,
  parsePluginListOutput,
  substituteTemplate,
  type DetectedRepoInfo,
} from './init'

describe('deriveIdPrefix', () => {
  test('takes the first three letters, uppercased', () => {
    expect(deriveIdPrefix('nfkit')).toBe('NFK')
    expect(deriveIdPrefix('le-petit-prince')).toBe('LEP')
  })

  test('strips non-letters before taking the prefix', () => {
    expect(deriveIdPrefix('a-1-b')).toBe('AB')
  })

  test('falls back to TICKET for a basename with no letters', () => {
    expect(deriveIdPrefix('1234')).toBe('TICKET')
    expect(deriveIdPrefix('')).toBe('TICKET')
  })
})

describe('substituteTemplate', () => {
  test('replaces every known placeholder', () => {
    expect(substituteTemplate('hello {{NAME}}, you are {{ROLE}}', { NAME: 'x', ROLE: 'y' })).toBe(
      'hello x, you are y',
    )
  })

  test('throws on an unresolved placeholder', () => {
    expect(() => substituteTemplate('hello {{MISSING}}', {})).toThrow(
      /unknown placeholder \{\{MISSING\}\}/,
    )
  })
})

describe('parseInitArguments', () => {
  test('defaults to force: false, no tracker override', () => {
    expect(parseInitArguments([])).toEqual({ force: false, trackerOverride: null })
  })

  test('parses --force', () => {
    expect(parseInitArguments(['--force'])).toEqual({ force: true, trackerOverride: null })
  })

  test('parses --tracker <kind>', () => {
    expect(parseInitArguments(['--tracker', 'github'])).toEqual({
      force: false,
      trackerOverride: 'github',
    })
  })

  test('rejects an unknown --tracker value', () => {
    expect(() => parseInitArguments(['--tracker', 'jira'])).toThrow(
      /--tracker must be one of linear\|github\|local/,
    )
  })
})

describe('buildForgeConfig', () => {
  test('materializes every field from the detected info', () => {
    const detected: DetectedRepoInfo = {
      repoName: 'nfkit',
      packageManager: 'bun',
      trunk: 'main',
      trunkWasDetected: true,
      tracker: 'local',
      idPrefix: 'NFK',
      selfCheck: ['bun run check'],
    }
    const config = buildForgeConfig(detected)
    expect(config.repo).toEqual({ trunk: 'main', remote: 'origin' })
    expect(config.ticket).toEqual({ idPattern: '^NFK-\\d+$', branchPrefix: 'nfk' })
    expect(config.version).toBe(1)
    expect(config.concurrency.waveSize).toBeGreaterThan(0)
  })
})

describe('buildTrackerConfig', () => {
  const base: DetectedRepoInfo = {
    repoName: 'nfkit',
    packageManager: 'bun',
    trunk: 'main',
    trunkWasDetected: true,
    tracker: 'local',
    idPrefix: 'NFK',
    selfCheck: [],
  }

  test('linear: onPrOpen/onPrMerge automatic, no per-kind sub-object', () => {
    const tracker = buildTrackerConfig({ ...base, tracker: 'linear' }) as Record<string, unknown>
    expect(tracker.kind).toBe('linear')
    expect(tracker.transitions).toEqual({
      onStart: 'worker',
      onPrOpen: 'automatic',
      onPrMerge: 'automatic',
    })
    expect(tracker.github).toBeUndefined()
    expect(tracker.local).toBeUndefined()
  })

  test('github: onPrOpen coordinator (label swap), onPrMerge automatic (closing keyword), stateLabels match forge init\'s own label creation', () => {
    const tracker = buildTrackerConfig({ ...base, tracker: 'github' }) as Record<string, unknown>
    expect(tracker.kind).toBe('github')
    expect(tracker.transitions).toEqual({
      onStart: 'worker',
      onPrOpen: 'coordinator',
      onPrMerge: 'automatic',
    })
    expect(tracker.github).toEqual({
      priorityLabels: {},
      stateLabels: {
        todo: 'status:todo',
        'in-progress': 'status:in-progress',
        'in-review': 'status:in-review',
      },
    })
  })

  test('local: onPrOpen/onPrMerge both coordinator — no tracker automation exists yet', () => {
    const tracker = buildTrackerConfig({ ...base, tracker: 'local', idPrefix: 'NFK' }) as Record<
      string,
      unknown
    >
    expect(tracker.kind).toBe('local')
    expect(tracker.transitions).toEqual({
      onStart: 'worker',
      onPrOpen: 'coordinator',
      onPrMerge: 'coordinator',
    })
    expect(tracker.local).toEqual({ idPrefix: 'NFK' })
  })

  test('every kind carries the same five canonical triage labels', () => {
    for (const tracker of ['linear', 'github', 'local'] as const) {
      const config = buildTrackerConfig({ ...base, tracker }) as Record<string, unknown>
      expect(config.triageLabels).toEqual([
        'needs-triage',
        'needs-info',
        'ready-for-agent',
        'ready-for-human',
        'wontfix',
      ])
      expect(config.readyLabel).toBe('ready-for-agent')
    }
  })
})

describe('filesystem-based detection', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-init-test-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test('detectPackageManager: bun.lock wins', async () => {
    await Bun.write(path.join(repoRoot, 'bun.lock'), '')
    expect(await detectPackageManager(repoRoot)).toBe('bun')
  })

  test('detectPackageManager: pnpm-lock.yaml -> pnpm', async () => {
    await Bun.write(path.join(repoRoot, 'pnpm-lock.yaml'), '')
    expect(await detectPackageManager(repoRoot)).toBe('pnpm')
  })

  test('detectPackageManager: package-lock.json -> npm', async () => {
    await Bun.write(path.join(repoRoot, 'package-lock.json'), '')
    expect(await detectPackageManager(repoRoot)).toBe('npm')
  })

  test('detectPackageManager: package.json with no lockfile defaults to bun', async () => {
    await Bun.write(path.join(repoRoot, 'package.json'), '{}')
    expect(await detectPackageManager(repoRoot)).toBe('bun')
  })

  test('detectPackageManager: go.mod with no package.json -> go', async () => {
    await Bun.write(path.join(repoRoot, 'go.mod'), 'module example.com/x\n')
    expect(await detectPackageManager(repoRoot)).toBe('go')
  })

  test('detectPackageManager: Cargo.toml -> cargo', async () => {
    await Bun.write(path.join(repoRoot, 'Cargo.toml'), '[package]\n')
    expect(await detectPackageManager(repoRoot)).toBe('cargo')
  })

  test('detectPackageManager: pyproject.toml -> python', async () => {
    await Bun.write(path.join(repoRoot, 'pyproject.toml'), '[project]\n')
    expect(await detectPackageManager(repoRoot)).toBe('python')
  })

  test('detectPackageManager: nothing recognizable -> unknown', async () => {
    expect(await detectPackageManager(repoRoot)).toBe('unknown')
  })

  test('hasLinearMcpServer: true when a server key mentions linear', async () => {
    await Bun.write(
      path.join(repoRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'linear-server': { command: 'npx', args: ['mcp-remote'] } } }),
    )
    expect(await hasLinearMcpServer(repoRoot)).toBe(true)
  })

  test('hasLinearMcpServer: true when only the args mention linear', async () => {
    await Bun.write(
      path.join(repoRoot, '.mcp.json'),
      JSON.stringify({
        mcpServers: { issues: { command: 'npx', args: ['mcp-remote', 'https://mcp.linear.app/sse'] } },
      }),
    )
    expect(await hasLinearMcpServer(repoRoot)).toBe(true)
  })

  test('hasLinearMcpServer: false with no .mcp.json', async () => {
    expect(await hasLinearMcpServer(repoRoot)).toBe(false)
  })

  test('hasLinearMcpServer: false when present but unrelated', async () => {
    await Bun.write(
      path.join(repoRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { supabase: { command: 'bun', args: ['run', 'mcp.ts'] } } }),
    )
    expect(await hasLinearMcpServer(repoRoot)).toBe(false)
  })

  test('hasLinearMcpServer: false on malformed JSON, never throws', async () => {
    await Bun.write(path.join(repoRoot, '.mcp.json'), '{not json')
    expect(await hasLinearMcpServer(repoRoot)).toBe(false)
  })

  test('detectTrunk: null outside a git repository', async () => {
    expect(await detectTrunk(repoRoot)).toBeNull()
  })

  test('detectTrunk: null when origin/HEAD symref is unset, even inside a repo', async () => {
    await Bun.$`git -C ${repoRoot} init --quiet`.quiet()
    expect(await detectTrunk(repoRoot)).toBeNull()
  })

  test('detectTrunk: resolves the trunk from a real origin/HEAD symref, regardless of the current branch', async () => {
    const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-init-remote-'))
    try {
      await Bun.$`git -C ${remoteRoot} init --quiet --bare --initial-branch=main`.quiet()
      await Bun.$`git -C ${repoRoot} init --quiet --initial-branch=main`.quiet()
      await Bun.$`git -C ${repoRoot} config user.email test@example.com`.quiet()
      await Bun.$`git -C ${repoRoot} config user.name test`.quiet()
      await Bun.$`git -C ${repoRoot} commit --quiet --allow-empty -m init`.quiet()
      await Bun.$`git -C ${repoRoot} remote add origin ${remoteRoot}`.quiet()
      await Bun.$`git -C ${repoRoot} push --quiet origin main`.quiet()
      await Bun.$`git -C ${repoRoot} remote set-head origin main`.quiet()
      await Bun.$`git -C ${repoRoot} checkout --quiet -b some-feature-branch`.quiet()

      expect(await detectTrunk(repoRoot)).toBe('main')
    } finally {
      rmSync(remoteRoot, { recursive: true, force: true })
    }
  })

  test('detectJsSelfCheck: prefers a single "check" script', async () => {
    await Bun.write(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { check: 'x', lint: 'y', typecheck: 'z' } }),
    )
    expect(await detectJsSelfCheck(repoRoot, 'bun')).toEqual(['bun run check'])
  })

  test('detectJsSelfCheck: falls back to lint+typecheck when no "check" script', async () => {
    await Bun.write(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { lint: 'y', typecheck: 'z' } }),
    )
    expect(await detectJsSelfCheck(repoRoot, 'pnpm')).toEqual([
      'pnpm run lint',
      'pnpm run typecheck',
    ])
  })

  test('detectJsSelfCheck: npm uses "npm run", not "npm run run"', async () => {
    await Bun.write(path.join(repoRoot, 'package.json'), JSON.stringify({ scripts: { check: 'x' } }))
    expect(await detectJsSelfCheck(repoRoot, 'npm')).toEqual(['npm run check'])
  })

  test('detectJsSelfCheck: empty when neither script exists', async () => {
    await Bun.write(path.join(repoRoot, 'package.json'), JSON.stringify({ scripts: {} }))
    expect(await detectJsSelfCheck(repoRoot, 'bun')).toEqual([])
  })

  test('detectJsSelfCheck: empty with no package.json at all', async () => {
    expect(await detectJsSelfCheck(repoRoot, 'bun')).toEqual([])
  })

  test('detectGoSelfCheck: the fixed pair with no Makefile', async () => {
    expect(await detectGoSelfCheck(repoRoot)).toEqual(['go build ./...', 'go test ./...'])
  })

  test('detectGoSelfCheck: adds "make lint" only if the Makefile declares that target', async () => {
    await Bun.write(path.join(repoRoot, 'Makefile'), 'lint:\n\tgolangci-lint run\n')
    expect(await detectGoSelfCheck(repoRoot)).toEqual([
      'go build ./...',
      'go test ./...',
      'make lint',
    ])
  })

  test('detectGoSelfCheck: a Makefile without a lint target does not add it', async () => {
    await Bun.write(path.join(repoRoot, 'Makefile'), 'build:\n\tgo build ./...\n')
    expect(await detectGoSelfCheck(repoRoot)).toEqual(['go build ./...', 'go test ./...'])
  })

  test('detectTrackerKind: local when there is no Linear MCP server and no GitHub remote', async () => {
    expect(await detectTrackerKind(repoRoot)).toBe('local')
  })

  test('detectTrackerKind: linear takes priority over any GitHub signal', async () => {
    await Bun.write(
      path.join(repoRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'linear-server': { command: 'npx', args: [] } } }),
    )
    expect(await detectTrackerKind(repoRoot)).toBe('linear')
  })
})

describe('parsePluginListOutput', () => {
  const PLUGIN_ID = 'mattpocock-skills@claude-plugins-official'

  test('missing when the plugin is absent from the listing', () => {
    const output = [
      'Installed plugins:',
      '',
      '  ❯ cloudflare@cloudflare',
      '    Version: 1.0.0',
      '    Status: ✔ enabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('missing')
  })

  test('installed when the plugin is listed as enabled', () => {
    const output = [
      'Installed plugins:',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Version: 1.2.3',
      '    Scope: user',
      '    Status: ✔ enabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('installed')
  })

  test('disabled when the plugin is listed as disabled', () => {
    const output = [
      'Installed plugins:',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Version: 1.2.3',
      '    Status: disabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('disabled')
  })

  test('a different disabled plugin does not produce a false positive', () => {
    const output = [
      'Installed plugins:',
      '',
      '  ❯ some-other-plugin@marketplace',
      '    Status: disabled',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Status: ✔ enabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('installed')
  })

  test('missing on empty output', () => {
    expect(parsePluginListOutput('', PLUGIN_ID)).toBe('missing')
  })
})
