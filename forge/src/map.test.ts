import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { checkStale, filterMapForGlobs, generateMap, mappedAreas, parseStamp } from './map'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function sh(root: string, ...args: string[]): Promise<void> {
  const result = await Bun.$`git -C ${root} ${args}`.quiet()
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed`)
}

function write(root: string, file: string, content: string): void {
  const full = path.join(root, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

async function commit(root: string, message: string): Promise<void> {
  await sh(root, 'add', '-A')
  await sh(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
}

async function fixtureRepo(): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'forge-map-'))
  roots.push(root)
  await sh(root, 'init', '-q')
  write(
    root,
    'package.json',
    JSON.stringify({
      name: 'demo',
      scripts: { test: 'bun test', lint: 'biome check' },
      devDependencies: { '@types/bun': '^1', typescript: '^5' },
    }),
  )
  write(root, 'bun.lock', '')
  write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}')
  write(root, 'biome.json', '{}')
  write(root, 'src/app.ts', 'export {}')
  write(root, 'src/app.test.ts', 'export {}')
  write(root, 'docs/readme.md', '# hi')
  await commit(root, 'feat: init')
  write(root, 'src/app.ts', 'export const a = 1')
  await commit(root, 'fix: tweak')
  return root
}

describe('generateMap', () => {
  test('covers stack, structure, conventions, testing and hotspots with a stamp', async () => {
    const root = await fixtureRepo()
    const map = await generateMap(root)
    const head = (await Bun.$`git -C ${root} rev-parse HEAD`.text()).trim()
    expect(parseStamp(map)).toBe(head)
    for (const title of ['Stack', 'Structure', 'Conventions', 'Testing', 'Hotspots']) {
      expect(map).toContain(`## ${title}`)
    }
    expect(map).toContain('package manager: bun')
    expect(map).toContain('- `src/` (2 files)')
    expect(map).toContain('Biome configured')
    expect(map).toContain('`strict` mode')
    expect(map).toContain('conventional commits')
    expect(map).toContain('Test command: `bun test`')
    expect(map).toContain('- `src/` (1 test files)')
    expect(map).toContain('- `src/app.ts` (2 commits)')
  })

  test('is deterministic for the same commit', async () => {
    const root = await fixtureRepo()
    expect(await generateMap(root)).toBe(await generateMap(root))
  })
})

describe('filterMapForGlobs', () => {
  test('keeps global sections and only the matching path bullets', async () => {
    const root = await fixtureRepo()
    const map = await generateMap(root)
    const filtered = filterMapForGlobs(map, ['docs/**'])
    expect(filtered).toContain('## Stack')
    expect(filtered).toContain('- `docs/` (1 files)')
    expect(filtered).not.toContain('- `src/` (2 files)')
    expect(filtered).not.toContain('## Testing')
    expect(filtered).not.toContain('src/app.ts')
  })

  test('matches a file glob against directory bullets', async () => {
    const root = await fixtureRepo()
    const filtered = filterMapForGlobs(await generateMap(root), ['src/app.ts'])
    expect(filtered).toContain('- `src/` (2 files)')
    expect(filtered).toContain('## Testing')
    expect(filtered).toContain('- `src/app.ts` (2 commits)')
  })
})

describe('checkStale', () => {
  test('missing map is stale', async () => {
    const root = await fixtureRepo()
    expect((await checkStale(root, 'docs/agents/codebase.md', 10)).stale).toBe(true)
  })

  test('counts only commits touching mapped areas, ignoring the map itself', async () => {
    const root = await fixtureRepo()
    const mapPath = 'docs/agents/codebase.md'
    write(root, mapPath, await generateMap(root))
    await commit(root, 'docs: add map')
    expect(mappedAreas(await Bun.file(path.join(root, mapPath)).text())).toContain('src')
    expect((await checkStale(root, mapPath, 0)).stale).toBe(false)

    write(root, 'src/app.ts', 'export const a = 2')
    await commit(root, 'fix: one')
    write(root, 'src/app.ts', 'export const a = 3')
    await commit(root, 'fix: two')
    expect((await checkStale(root, mapPath, 2)).stale).toBe(false)
    expect((await checkStale(root, mapPath, 1)).stale).toBe(true)
  })

  test('unknown stamp is stale', async () => {
    const root = await fixtureRepo()
    write(root, 'map.md', '<!-- forge-map commit=deadbeefdeadbeef -->\n## Structure\n\n- `src/` (1 files)\n')
    const verdict = await checkStale(root, 'map.md', 10)
    expect(verdict.stale).toBe(true)
    expect(verdict.reason).toContain('not in history')
  })
})
