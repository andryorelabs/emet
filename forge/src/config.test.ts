import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_FORGE_CONFIG,
  ForgeConfigError,
  loadForgeConfig,
  loadForgeConfigWithDefaults,
  requireForgeConfig,
  type ForgeConfig,
} from './config'

/**
 * `config.ts` gates whether `cleanup` (which force-deletes branches) and
 * `preflight`/`claims`/`slots` run at all — a wrong `repo.trunk` here doesn't
 * just warn, it deletes unmerged work (see `cleanup.ts`'s own file-level doc
 * comment). These tests exercise `validateAndMerge`'s two-tier absent/
 * malformed logic indirectly through `loadForgeConfig` (the only exported
 * entry point), since a repo's own `forge.config.json` is the only realistic
 * way this logic is ever invoked.
 */

let repoRoot: string

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-config-test-'))
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

async function writeConfig(value: unknown): Promise<void> {
  await Bun.write(
    path.join(repoRoot, 'forge.config.json'),
    typeof value === 'string' ? value : JSON.stringify(value),
  )
}

describe('loadForgeConfig', () => {
  test('absent when forge.config.json does not exist', async () => {
    expect(await loadForgeConfig(repoRoot)).toEqual({ status: 'absent' })
  })

  test('malformed on invalid JSON', async () => {
    await writeConfig('{not json')
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('malformed')
    expect((result as { reason: string }).reason).toMatch(/not valid JSON/)
  })

  test('malformed when the top-level value is not an object', async () => {
    await writeConfig(['not', 'an', 'object'])
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('malformed')
    expect((result as { reason: string }).reason).toMatch(/top-level value must be a JSON object/)
  })

  test('an empty object merges cleanly onto every default', async () => {
    await writeConfig({})
    const result = await loadForgeConfig(repoRoot)
    expect(result).toEqual({ status: 'ok', config: DEFAULT_FORGE_CONFIG })
  })

  test('a fully-specified config round-trips exactly', async () => {
    const full: ForgeConfig = {
      version: 1,
      repo: { trunk: 'develop', remote: 'upstream' },
      ticket: { idPattern: '^NFK-\\d+$', branchPrefix: 'nfk' },
      concurrency: { waveSize: 2, maxLiveWorkers: 4, runIdleThresholdMs: 60_000 },
      tracker: { kind: 'github' },
      preflight: {
        requiredFiles: [{ path: '.env.keys', why: 'needed for tests' }],
        requiredCommands: ['gh'],
      },
      handoff: { maxLines: 30, maxChars: 4000 },
      usage: { oversizedReadLines: 200, stalledMinutes: 5 },
    }
    await writeConfig(full)
    expect(await loadForgeConfig(repoRoot)).toEqual({ status: 'ok', config: full })
  })

  test('a partial config merges only the provided sections onto defaults', async () => {
    await writeConfig({ repo: { trunk: 'develop' } })
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('ok')
    const config = (result as { config: typeof DEFAULT_FORGE_CONFIG }).config
    expect(config.repo).toEqual({ trunk: 'develop', remote: 'origin' })
    expect(config.ticket).toEqual(DEFAULT_FORGE_CONFIG.ticket)
    expect(config.concurrency).toEqual(DEFAULT_FORGE_CONFIG.concurrency)
  })

  test('rejects an unsupported version', async () => {
    await writeConfig({ version: 2 })
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('malformed')
    expect((result as { reason: string }).reason).toMatch(/unsupported "version"/)
  })

  test('rejects an empty repo.trunk', async () => {
    await writeConfig({ repo: { trunk: '' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(/"repo.trunk" must be a non-empty string/)
  })

  test('rejects an empty repo.remote', async () => {
    await writeConfig({ repo: { remote: '' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(/"repo.remote" must be a non-empty string/)
  })

  test('rejects an invalid ticket.idPattern regex', async () => {
    await writeConfig({ ticket: { idPattern: '(unterminated' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(
      /"ticket.idPattern" is not a valid regular expression/,
    )
  })

  test('rejects a ticket.branchPrefix with uppercase or invalid characters', async () => {
    await writeConfig({ ticket: { branchPrefix: 'AO_1' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(
      /"ticket.branchPrefix" must be a non-empty lowercase string/,
    )
  })

  test.each([
    ['concurrency.waveSize', { concurrency: { waveSize: 0 } }],
    ['concurrency.maxLiveWorkers', { concurrency: { maxLiveWorkers: -1 } }],
    ['concurrency.runIdleThresholdMs', { concurrency: { runIdleThresholdMs: 1.5 } }],
    ['handoff.maxLines', { handoff: { maxLines: 0 } }],
    ['handoff.maxChars', { handoff: { maxChars: -100 } }],
    ['usage.oversizedReadLines', { usage: { oversizedReadLines: 0 } }],
    ['usage.stalledMinutes', { usage: { stalledMinutes: -5 } }],
  ])('rejects a non-positive-integer %s', async (field, patch) => {
    await writeConfig(patch)
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('malformed')
    expect((result as { reason: string }).reason).toContain(`"${field}"`)
  })

  test('accepts "auto" for concurrency.maxLiveWorkers', async () => {
    await writeConfig({ concurrency: { maxLiveWorkers: 'auto' } })
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('ok')
    expect(
      (result as { config: typeof DEFAULT_FORGE_CONFIG }).config.concurrency.maxLiveWorkers,
    ).toBe('auto')
  })

  test('rejects a concurrency.maxLiveWorkers string other than "auto"', async () => {
    await writeConfig({ concurrency: { maxLiveWorkers: 'unlimited' } })
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('malformed')
    expect((result as { reason: string }).reason).toMatch(
      /"concurrency.maxLiveWorkers" must be a positive integer, or the string "auto"/,
    )
  })

  test('defaults concurrency.maxLiveWorkers to "auto" when omitted', async () => {
    await writeConfig({})
    const result = await loadForgeConfig(repoRoot)
    expect(
      (result as { config: typeof DEFAULT_FORGE_CONFIG }).config.concurrency.maxLiveWorkers,
    ).toBe('auto')
  })

  test('rejects preflight.requiredFiles when not an array', async () => {
    await writeConfig({ preflight: { requiredFiles: 'nope' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(/"preflight.requiredFiles" must be an array/)
  })

  test('rejects a preflight.requiredFiles entry missing "why"', async () => {
    await writeConfig({ preflight: { requiredFiles: [{ path: '.env.keys' }] } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(
      /"preflight.requiredFiles\[0\]" must be \{"path": string, "why": string\}/,
    )
  })

  test('an unrecognized top-level key is never an error', async () => {
    await writeConfig({ tracker: { kind: 'github' }, someFutureField: true })
    const result = await loadForgeConfig(repoRoot)
    expect(result.status).toBe('ok')
  })

  test('reads tracker.kind', async () => {
    await writeConfig({ tracker: { kind: 'github' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { config: typeof DEFAULT_FORGE_CONFIG }).config.tracker).toEqual({
      kind: 'github',
    })
  })

  test('keeps the rest of the prose tracker section out of the way', async () => {
    await writeConfig({ tracker: { kind: 'linear', readyLabel: 'ready-for-agent' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { config: typeof DEFAULT_FORGE_CONFIG }).config.tracker).toEqual({
      kind: 'linear',
    })
  })

  test('a config predating tracker.kind reads as null, never a guessed default', async () => {
    await writeConfig({ repo: { trunk: 'main' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { config: typeof DEFAULT_FORGE_CONFIG }).config.tracker).toEqual({
      kind: null,
    })
  })

  test('rejects a tracker.kind outside the enum', async () => {
    await writeConfig({ tracker: { kind: 'jira' } })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(
      /"tracker.kind" must be one of linear\|github\|local/,
    )
  })

  test('rejects a non-object tracker', async () => {
    await writeConfig({ tracker: 'github' })
    const result = await loadForgeConfig(repoRoot)
    expect((result as { reason: string }).reason).toMatch(/"tracker" must be an object/)
  })

  test('reads preflight.requiredCommands, defaulting to empty', async () => {
    await writeConfig({ preflight: { requiredCommands: ['rg', 'sg'] } })
    const result = await loadForgeConfig(repoRoot)
    expect(
      (result as { config: typeof DEFAULT_FORGE_CONFIG }).config.preflight.requiredCommands,
    ).toEqual(['rg', 'sg'])
  })

  test('rejects preflight.requiredCommands when not an array of non-empty strings', async () => {
    await writeConfig({ preflight: { requiredCommands: 'rg' } })
    expect((await loadForgeConfig(repoRoot) as { reason: string }).reason).toMatch(
      /"preflight.requiredCommands" must be an array/,
    )
    await writeConfig({ preflight: { requiredCommands: [''] } })
    expect((await loadForgeConfig(repoRoot) as { reason: string }).reason).toMatch(
      /"preflight.requiredCommands\[0\]" must be a non-empty string/,
    )
  })
})

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

describe('requireForgeConfig', () => {
  test('throws ForgeConfigError naming `forge init` when absent', async () => {
    const error = await captureRejection(requireForgeConfig(repoRoot))
    expect(error).toBeInstanceOf(ForgeConfigError)
    expect((error as Error).message).toMatch(/forge init/)
  })

  test('throws ForgeConfigError with the validation reason when malformed', async () => {
    await writeConfig({ version: 2 })
    const error = await captureRejection(requireForgeConfig(repoRoot))
    expect((error as Error).message).toMatch(/unsupported "version"/)
  })

  test('returns the merged config when valid', async () => {
    await writeConfig({ repo: { trunk: 'develop', remote: 'origin' } })
    const config = await requireForgeConfig(repoRoot)
    expect(config.repo.trunk).toBe('develop')
  })
})

describe('loadForgeConfigWithDefaults', () => {
  test('degrades to DEFAULT_FORGE_CONFIG with a note when absent', async () => {
    const result = await loadForgeConfigWithDefaults(repoRoot)
    expect(result.config).toEqual(DEFAULT_FORGE_CONFIG)
    expect(result.note).toMatch(/no forge.config.json/)
  })

  test('still throws ForgeConfigError when malformed — a typo is never mistaken for absent', async () => {
    await writeConfig('{not json')
    const error = await captureRejection(loadForgeConfigWithDefaults(repoRoot))
    expect(error).toBeInstanceOf(ForgeConfigError)
  })

  test('returns the real config with no note when valid', async () => {
    await writeConfig({ repo: { trunk: 'develop', remote: 'origin' } })
    const result = await loadForgeConfigWithDefaults(repoRoot)
    expect(result.config.repo.trunk).toBe('develop')
    expect(result.note).toBeUndefined()
  })
})

describe('resolveRepoRoot', () => {
  test('null outside a git repository', async () => {
    // resolveRepoRoot() shells `git rev-parse --show-toplevel` against
    // process.cwd() with no override, and this test file's own cwd (this
    // repo's own checkout) is itself a git repo — the only way to exercise
    // the null branch is a different cwd. A real `process.chdir()` would do
    // that, but `bun test` runs every file's tests in one shared process, so
    // mutating global cwd here can race a concurrently-running test in
    // another file that (correctly) assumes its own cwd is unchanged — a
    // separate `bun -e` subprocess, given the tmpdir as its own `cwd`, is
    // isolated instead.
    const script = `import { resolveRepoRoot } from ${JSON.stringify(path.join(import.meta.dirname, 'config.ts'))}; console.log(JSON.stringify(await resolveRepoRoot()))`
    const proc = Bun.spawn(['bun', '-e', script], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'inherit',
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    expect(JSON.parse(output.trim())).toBeNull()
  })
})
