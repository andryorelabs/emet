import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  FORGE_AGENT_NAMES,
  MATTPOCOCK_SKILLS_PLUGIN_ID,
  checkDependencies,
  classifyClaudePluginProbe,
  classifyForgeAgentsProbe,
  classifyGithubCliProbe,
  classifyLinearMcpProbe,
  findLinearMcpEntry,
  formatDependencyCheck,
  indeterminateChecks,
  mcpListMentionsLinear,
  parsePluginListOutput,
  probeForgeAgents,
  probeLinearMcpServer,
  unsatisfiedChecks,
  type ClaudePluginProbe,
  type DependencyProbes,
  type ForgeAgentsProbe,
  type GithubCliProbe,
  type LinearMcpProbe,
} from './dependencies'

const PLUGIN_ID = MATTPOCOCK_SKILLS_PLUGIN_ID

function stubProbes(overrides: {
  readonly claudePlugin?: ClaudePluginProbe
  readonly githubCli?: GithubCliProbe
  readonly linearMcpServer?: LinearMcpProbe
  readonly forgeAgents?: ForgeAgentsProbe
}): DependencyProbes {
  return {
    claudePlugin: async () => overrides.claudePlugin ?? { kind: 'listed', status: 'installed' },
    githubCli: async () => overrides.githubCli ?? { kind: 'authenticated' },
    linearMcpServer: async () =>
      overrides.linearMcpServer ?? { kind: 'declared', source: 'mcp-json' },
    forgeAgents: async () => overrides.forgeAgents ?? { kind: 'present' },
  }
}

describe('parsePluginListOutput', () => {
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

  test('installed when a later scope enables what the first scope disabled', () => {
    const output = [
      'Installed plugins:',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Scope: project',
      '    Status: disabled',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Scope: user',
      '    Status: ✔ enabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('installed')
  })

  test('disabled only when every scope listing it is disabled', () => {
    const output = [
      `  ❯ ${PLUGIN_ID}`,
      '    Scope: project',
      '    Status: disabled',
      '',
      `  ❯ ${PLUGIN_ID}`,
      '    Scope: user',
      '    Status: disabled',
      '',
    ].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('disabled')
  })

  test('an id that merely ends with the plugin id does not match', () => {
    const output = [`  ❯ vendored-${PLUGIN_ID}`, '    Status: ✔ enabled', ''].join('\n')
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe('missing')
  })

  test('missing on empty output', () => {
    expect(parsePluginListOutput('', PLUGIN_ID)).toBe('missing')
  })
})

describe('classifyClaudePluginProbe', () => {
  test('a missing plugin is unsatisfied — it really is not there', () => {
    const check = classifyClaudePluginProbe({ kind: 'listed', status: 'missing' })
    expect(check.status).toBe('unsatisfied')
    expect(check.remedy).toEqual([
      'claude plugin marketplace add anthropics/claude-plugins-official',
      `claude plugin install ${PLUGIN_ID}`,
    ])
  })

  test('a disabled plugin is unsatisfied', () => {
    expect(classifyClaudePluginProbe({ kind: 'listed', status: 'disabled' }).status).toBe(
      'unsatisfied',
    )
  })

  test('an installed plugin is satisfied', () => {
    expect(classifyClaudePluginProbe({ kind: 'listed', status: 'installed' }).status).toBe(
      'satisfied',
    )
  })

  test('claude not on PATH is indeterminate, never unsatisfied', () => {
    const check = classifyClaudePluginProbe({ kind: 'claude-not-on-path' })
    expect(check.status).toBe('indeterminate')
    expect(check.summary).toContain('could not verify')
  })

  test('a failed claude invocation is indeterminate', () => {
    expect(classifyClaudePluginProbe({ kind: 'claude-failed', detail: 'exit code 1' }).status).toBe(
      'indeterminate',
    )
  })
})

describe('classifyForgeAgentsProbe', () => {
  test('present is satisfied', () => {
    expect(classifyForgeAgentsProbe({ kind: 'present' }).status).toBe('satisfied')
  })

  test('missing is unsatisfied and names the missing agents plus the fix', () => {
    const check = classifyForgeAgentsProbe({ kind: 'missing', missing: ['forge-reviewer'] })
    expect(check.status).toBe('unsatisfied')
    expect(check.summary).toContain('forge-reviewer')
    expect(check.remedy).toEqual(['./install.sh'])
  })
})

describe('probeForgeAgents', () => {
  test('present when both agent files exist', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'forge-agents-'))
    try {
      for (const name of FORGE_AGENT_NAMES) {
        writeFileSync(path.join(directory, `${name}.md`), '')
      }
      expect(probeForgeAgents(directory)).toEqual({ kind: 'present' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('missing lists every agent file that is absent', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'forge-agents-'))
    try {
      expect(probeForgeAgents(directory)).toEqual({
        kind: 'missing',
        missing: [...FORGE_AGENT_NAMES],
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('classifyGithubCliProbe', () => {
  test('authenticated is satisfied', () => {
    expect(classifyGithubCliProbe({ kind: 'authenticated' }).status).toBe('satisfied')
  })

  test('not on PATH is unsatisfied and names the install page', () => {
    const check = classifyGithubCliProbe({ kind: 'not-on-path' })
    expect(check.status).toBe('unsatisfied')
    expect(check.summary).toContain('https://cli.github.com')
  })

  test('unauthenticated is unsatisfied and names gh auth login', () => {
    const check = classifyGithubCliProbe({ kind: 'unauthenticated' })
    expect(check.status).toBe('unsatisfied')
    expect(check.summary).toContain('gh auth login')
  })

  test('a timed-out probe is indeterminate, so no network never blocks dispatch', () => {
    expect(classifyGithubCliProbe({ kind: 'timed-out' }).status).toBe('indeterminate')
  })
})

describe('classifyLinearMcpProbe', () => {
  test('a declared server is satisfied but states the auth limitation', () => {
    const check = classifyLinearMcpProbe({ kind: 'declared', source: 'mcp-json' })
    expect(check.status).toBe('satisfied')
    expect(check.limitation).toContain('not that the connection is authenticated')
  })

  test('a malformed entry is unsatisfied', () => {
    const check = classifyLinearMcpProbe({ kind: 'entry-malformed', serverKey: 'linear-server' })
    expect(check.status).toBe('unsatisfied')
    expect(check.summary).toContain('linear-server')
  })

  test('not declared anywhere is unsatisfied', () => {
    expect(classifyLinearMcpProbe({ kind: 'not-declared', searchedAllScopes: true }).status).toBe(
      'unsatisfied',
    )
  })

  test('not declared but user scopes unchecked is indeterminate', () => {
    expect(classifyLinearMcpProbe({ kind: 'not-declared', searchedAllScopes: false }).status).toBe(
      'indeterminate',
    )
  })

  test('an unreadable .mcp.json is unsatisfied', () => {
    expect(
      classifyLinearMcpProbe({ kind: 'mcp-json-unreadable', detail: 'Unexpected token' }).status,
    ).toBe('unsatisfied')
  })
})

describe('findLinearMcpEntry', () => {
  test('matches on the server key', () => {
    const parsed = { mcpServers: { 'linear-server': { command: 'npx', args: [] } } }
    expect(findLinearMcpEntry(parsed)).toEqual({ kind: 'well-formed', serverKey: 'linear-server' })
  })

  test('matches on args when the key does not mention linear', () => {
    const parsed = {
      mcpServers: { tickets: { command: 'npx', args: ['mcp-remote', 'https://mcp.linear.app/sse'] } },
    }
    expect(findLinearMcpEntry(parsed).kind).toBe('well-formed')
  })

  test('accepts a remote entry declared with type and url', () => {
    const parsed = { mcpServers: { tickets: { type: 'http', url: 'https://mcp.linear.app/mcp' } } }
    expect(findLinearMcpEntry(parsed).kind).toBe('well-formed')
  })

  test('a matching entry with neither command nor type+url is malformed', () => {
    const parsed = { mcpServers: { 'linear-server': {} } }
    expect(findLinearMcpEntry(parsed)).toEqual({ kind: 'malformed', serverKey: 'linear-server' })
  })

  test('absent when no server mentions linear', () => {
    const parsed = { mcpServers: { github: { command: 'gh' } } }
    expect(findLinearMcpEntry(parsed).kind).toBe('absent')
  })

  test('absent when mcpServers is missing or the document is not an object', () => {
    expect(findLinearMcpEntry({}).kind).toBe('absent')
    expect(findLinearMcpEntry(null).kind).toBe('absent')
    expect(findLinearMcpEntry('nope').kind).toBe('absent')
  })
})

describe('mcpListMentionsLinear', () => {
  test('true when the listing names a linear server', () => {
    expect(mcpListMentionsLinear('linear-server: https://mcp.linear.app/sse (HTTP) - ✓ Connected')).toBe(
      true,
    )
  })

  test('false for an unrelated listing', () => {
    expect(mcpListMentionsLinear('github: gh (stdio) - ✓ Connected')).toBe(false)
  })
})

describe('probeLinearMcpServer', () => {
  test('reports a malformed entry from a real .mcp.json', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'forge-deps-'))
    try {
      writeFileSync(
        path.join(directory, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'linear-server': {} } }),
      )
      expect(await probeLinearMcpServer(directory)).toEqual({
        kind: 'entry-malformed',
        serverKey: 'linear-server',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('reports unreadable JSON rather than throwing', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'forge-deps-'))
    try {
      writeFileSync(path.join(directory, '.mcp.json'), '{ not json')
      const probe = await probeLinearMcpServer(directory)
      expect(probe.kind).toBe('mcp-json-unreadable')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('declares the server when the entry is well-formed', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'forge-deps-'))
    try {
      writeFileSync(
        path.join(directory, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'linear-server': { command: 'npx', args: [] } } }),
      )
      expect(await probeLinearMcpServer(directory)).toEqual({
        kind: 'declared',
        source: 'mcp-json',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('formatDependencyCheck', () => {
  test('reproduces the exact missing-plugin text init has always printed', () => {
    const check = classifyClaudePluginProbe({ kind: 'listed', status: 'missing' })
    expect(formatDependencyCheck(check, '      ')).toBe(
      "mattpocock-skills plugin not found — /forge's interview/spec/ticket phases (1-5) need it. Run:\n" +
        '      claude plugin marketplace add anthropics/claude-plugins-official\n' +
        '      claude plugin install mattpocock-skills@claude-plugins-official',
    )
  })

  test('reproduces the exact disabled-plugin text', () => {
    const check = classifyClaudePluginProbe({ kind: 'listed', status: 'disabled' })
    expect(formatDependencyCheck(check, '      ')).toBe(
      'mattpocock-skills plugin is installed but disabled — run ' +
        '`claude plugin enable mattpocock-skills@claude-plugins-official`.',
    )
  })

  test('reproduces the exact gh texts', () => {
    expect(formatDependencyCheck(classifyGithubCliProbe({ kind: 'not-on-path' }), '      ')).toBe(
      "gh CLI not found on PATH — required for this repo's github tracker. Install: https://cli.github.com",
    )
    expect(formatDependencyCheck(classifyGithubCliProbe({ kind: 'unauthenticated' }), '      ')).toBe(
      'gh CLI found but not authenticated — run `gh auth login` before dispatching a wave.',
    )
  })

  test('indents every remedy line with the caller-supplied indent', () => {
    const check = classifyClaudePluginProbe({ kind: 'listed', status: 'missing' })
    expect(formatDependencyCheck(check, '  ')).toBe(
      "mattpocock-skills plugin not found — /forge's interview/spec/ticket phases (1-5) need it. Run:\n" +
        '  claude plugin marketplace add anthropics/claude-plugins-official\n' +
        '  claude plugin install mattpocock-skills@claude-plugins-official',
    )
  })
})

describe('checkDependencies', () => {
  test('always checks the plugin, whatever the tracker', async () => {
    for (const tracker of ['github', 'linear', 'local'] as const) {
      const checks = await checkDependencies({
        tracker,
        repoRoot: '/tmp',
        probes: stubProbes({}),
      })
      expect(checks.some((check) => check.dependency === 'claude-plugin')).toBe(true)
    }
  })

  test('checks gh only for a github tracker', async () => {
    const github = await checkDependencies({
      tracker: 'github',
      repoRoot: '/tmp',
      probes: stubProbes({ githubCli: { kind: 'unauthenticated' } }),
    })
    expect(unsatisfiedChecks(github).map((check) => check.dependency)).toEqual(['github-cli'])

    const local = await checkDependencies({
      tracker: 'local',
      repoRoot: '/tmp',
      probes: stubProbes({ githubCli: { kind: 'unauthenticated' } }),
    })
    expect(local.some((check) => check.dependency === 'github-cli')).toBe(false)
  })

  test('checks Linear only for a linear tracker', async () => {
    const linear = await checkDependencies({
      tracker: 'linear',
      repoRoot: '/tmp',
      probes: stubProbes({ linearMcpServer: { kind: 'not-declared', searchedAllScopes: true } }),
    })
    expect(unsatisfiedChecks(linear).map((check) => check.dependency)).toEqual(['linear-mcp-server'])

    const github = await checkDependencies({
      tracker: 'github',
      repoRoot: '/tmp',
      probes: stubProbes({ linearMcpServer: { kind: 'not-declared', searchedAllScopes: true } }),
    })
    expect(github.some((check) => check.dependency === 'linear-mcp-server')).toBe(false)
  })

  test('an undeclared tracker.kind skips tracker checks and says so', async () => {
    const checks = await checkDependencies({
      tracker: null,
      repoRoot: '/tmp',
      probes: stubProbes({ githubCli: { kind: 'not-on-path' } }),
    })
    expect(checks.map((check) => check.dependency)).toEqual([
      'claude-plugin',
      'forge-agents',
      'tracker-kind',
    ])
    expect(indeterminateChecks(checks).map((check) => check.dependency)).toEqual(['tracker-kind'])
    expect(unsatisfiedChecks(checks)).toEqual([])
  })

  test('a healthy github repo produces nothing to act on', async () => {
    const checks = await checkDependencies({
      tracker: 'github',
      repoRoot: '/tmp',
      probes: stubProbes({}),
    })
    expect(unsatisfiedChecks(checks)).toEqual([])
    expect(indeterminateChecks(checks)).toEqual([])
  })

  test('claude off PATH leaves a github repo blockable only by gh', async () => {
    const checks = await checkDependencies({
      tracker: 'github',
      repoRoot: '/tmp',
      probes: stubProbes({
        claudePlugin: { kind: 'claude-not-on-path' },
        githubCli: { kind: 'unauthenticated' },
      }),
    })
    expect(unsatisfiedChecks(checks).map((check) => check.dependency)).toEqual(['github-cli'])
    expect(indeterminateChecks(checks).map((check) => check.dependency)).toEqual(['claude-plugin'])
  })
})
