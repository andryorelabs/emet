/**
 * Validates and renders `.forge/handoff-AO-<n>.md` notes — the durable
 * checkpoint a `/forge` worker writes at three fixed triggers (first green
 * test, each closed dead-end, before each E2E run) so a compaction or a
 * successor session never has to re-investigate from scratch.
 *
 * Format (plain `key: value` sections, no YAML dependency): a line matching
 * `^(state|done|next|dead-ends|invariants|files|commands):` starts a
 * section; everything until the next section header belongs to it.
 *
 * Usage:
 *   forge handoff --check <path>    # exit 1 with reasons on any violation
 *   forge handoff --render <path>   # print a Linear-comment-ready body
 */

import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type ForgeConfig,
} from './config'

const REQUIRED_SECTIONS = [
  'state',
  'done',
  'next',
  'dead-ends',
  'invariants',
  'files',
  'commands',
] as const

const VALID_STATES = ['investigating', 'implementing', 'blocked', 'done']

/**
 * Fallback budget when a caller doesn't pass one explicitly — historically
 * hardcoded, now sourced from `forge.config.json`'s `handoff.maxLines`/
 * `maxChars`. See {@link checkHandoff}.
 */
const MAX_LINES = 60
const MAX_CHARS = 8000

type Sections = Map<string, string>

function parseSections(content: string): Sections {
  const sections: Sections = new Map()
  let currentKey: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentKey) {
      sections.set(currentKey, currentLines.join('\n').trim())
    }
  }

  for (const line of content.split('\n')) {
    const match = /^([a-z-]+):\s?(.*)$/i.exec(line)
    const key = match?.[1]?.toLowerCase()
    if (key && (REQUIRED_SECTIONS as readonly string[]).includes(key)) {
      flush()
      currentKey = key
      currentLines = match![2] ? [match![2]] : []
    } else if (currentKey) {
      currentLines.push(line)
    }
  }
  flush()

  return sections
}

function checkHandoff(
  content: string,
  path: string,
  maxLines: number = MAX_LINES,
  maxChars: number = MAX_CHARS,
): string[] {
  const problems: string[] = []
  const lineCount = content.split('\n').length

  if (lineCount > maxLines) {
    problems.push(
      `${path}: ${lineCount} lines exceeds the ${maxLines}-line budget — trim it, this is a checkpoint, not a log`,
    )
  }
  if (content.length > maxChars) {
    problems.push(
      `${path}: ${content.length} chars exceeds the ~${maxChars}-char (~2k token) budget`,
    )
  }

  const sections = parseSections(content)

  for (const key of REQUIRED_SECTIONS) {
    if (!sections.has(key) || sections.get(key)!.length === 0) {
      problems.push(`${path}: missing or empty required section "${key}:"`)
    }
  }

  const state = sections.get('state')?.trim()
  if (state && !VALID_STATES.includes(state)) {
    problems.push(
      `${path}: "state: ${state}" is not one of ${VALID_STATES.join(' | ')}`,
    )
  }

  const deadEnds = sections.get('dead-ends')?.trim() ?? ''
  if (state && state !== 'done' && deadEnds.length === 0) {
    problems.push(
      `${path}: state is "${state}" but "dead-ends:" is empty — a still-open ticket that has tried and failed anything must record it here, that's the field that pays for this whole mechanism`,
    )
  }

  return problems
}

/**
 * Extracts the ticket reference from a `.forge/handoff-<ticket>.md` path —
 * deliberately generic (`.+` rather than a config-sourced `ticket.idPattern`
 * spliced into a filename regex, which would need to strip that pattern's
 * own `^`/`$` anchors to compose safely) so it never needs to match this
 * repo's `ticket.idPattern` exactly. `reference/worker-prompt.md`'s
 * `{{handoff_path}}` is what actually fixes the filename shape at
 * write-time; this only has to extract whatever's there for the rendered
 * heading.
 */
function ticketReferenceFromPath(path: string): string {
  const match = /handoff-(.+)\.md$/i.exec(path)
  return match?.[1] ?? 'ticket'
}

async function main(config: ForgeConfig): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const mode = arguments_[0]
  const targetPath = arguments_[1]

  if (!targetPath || (mode !== '--check' && mode !== '--render')) {
    console.error(
      'usage: forge handoff --check <path> | --render <path>',
    )
    process.exitCode = 1
    return
  }

  const file = Bun.file(targetPath)
  if (!(await file.exists())) {
    console.error(`${targetPath}: not found`)
    process.exitCode = 1
    return
  }
  const content = await file.text()

  if (mode === '--check') {
    const problems = checkHandoff(
      content,
      targetPath,
      config.handoff.maxLines,
      config.handoff.maxChars,
    )
    if (problems.length > 0) {
      console.error('forge:handoff --check failed:')
      for (const problem of problems) {
        console.error(`  - ${problem}`)
      }
      process.exitCode = 1
      return
    }
    console.log(`forge:handoff --check OK (${targetPath})`)
    return
  }

  const ticketReference = ticketReferenceFromPath(targetPath)
  console.log(`## Handoff — ${ticketReference}\n\n${content.trim()}`)
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `handoff` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 *
 * This file previously had **no** `import.meta.main` guard at all — a bare
 * top-level `await main()` — so merely importing it for a test would run the
 * CLI. Fixed here as part of the extraction; it is the only one of the nine
 * modules that had this gap, and the only one still lacking a test file.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv]
  try {
    const repoRoot = await resolveRepoRoot()
    const { config, note } = repoRoot
      ? await loadForgeConfigWithDefaults(repoRoot)
      : { config: DEFAULT_FORGE_CONFIG, note: undefined }
    if (note) console.error(note)
    await main(config)
  } catch (error: unknown) {
    console.error(error)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
