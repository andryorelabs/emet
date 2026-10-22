import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type DestructiveVerdict =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string }

type ToolHookInput = {
  readonly tool_name?: string
  readonly cwd?: string
  readonly tool_input?: Record<string, unknown>
}

const ALLOW: DestructiveVerdict = { decision: 'allow' }

const SEGMENT_SEPARATOR = /\|\||&&|[;|&\n]/
const INERT_COMMANDS = new Set(['echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'gh'])
const WRAPPER_COMMANDS = new Set([
  'env',
  'sudo',
  'doas',
  'timeout',
  'xargs',
  'nice',
  'nohup',
  'command',
  'exec',
  'time',
  'builtin',
  'setsid',
  'stdbuf',
  'ionice',
])
const SQL_CLIENTS = /\b(psql|mysql|mariadb|sqlite3|sqlcmd|duckdb|clickhouse-client)\b/

type DestructiveRule = { readonly label: string; readonly pattern: RegExp }

const RULES: readonly DestructiveRule[] = [
  { label: 'git reset --hard', pattern: /\bgit\b[^\n]*\breset\b[^\n]*--hard\b/ },
  {
    label: 'git clean -f',
    pattern: /\bgit\b[^\n]*\bclean\b[^\n]*(\s-[a-zA-Z]*f[a-zA-Z]*(?=[\s"'`)]|$)|\s--force\b)/,
  },
  {
    label: 'git push --force',
    pattern:
      /\bgit\b[^\n]*\bpush\b[^\n]*(\s--force(?![-\w])|\s-[a-zA-Z]*f[a-zA-Z]*(?=[\s"'`)]|$)|\s\+\S)/,
  },
  {
    label: 'git branch -D',
    pattern: /\bgit\b[^\n]*\bbranch\b[^\n]*(\s-[a-zA-Z]*D[a-zA-Z]*(?=[\s"'`)]|$)|\s--delete\s+--force)/,
  },
  {
    label: 'rm -r',
    pattern:
      /(?:^|[\s;&|("'`])rm\s(?:[^\n]*\s)?(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?=\s|$|["'`)])/,
  },
]

const SQL_UPPERCASE =
  /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN)|TRUNCATE\s+(?:TABLE\s+)?[A-Za-z_"`])/
const SQL_ANY_CASE = new RegExp(SQL_UPPERCASE.source, 'i')

function leadingCommandWord(segment: string): string {
  const words = segment.trim().split(/\s+/)
  for (const word of words) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue
    if (word.startsWith('-')) continue
    const base = path.basename(word.replace(/^["'(]+/, ''))
    if (WRAPPER_COMMANDS.has(base)) continue
    if (/^\d+[smhd]?$/.test(base)) continue
    return base
  }
  return ''
}

function isInertSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (/^git\s+commit\b/.test(trimmed)) return true
  return INERT_COMMANDS.has(leadingCommandWord(segment))
}

/** Returns the matched rule's label when `command` contains a destructive operation, even wrapped. */
export function findDestructiveOperation(command: string): string | null {
  for (const segment of command.split(SEGMENT_SEPARATOR)) {
    if (segment.trim().length === 0 || isInertSegment(segment)) continue
    for (const rule of RULES) {
      if (rule.pattern.test(segment)) return rule.label
    }
    if (SQL_UPPERCASE.test(segment)) return 'DROP/TRUNCATE'
  }
  if (SQL_CLIENTS.test(command) && SQL_ANY_CASE.test(command)) return 'DROP/TRUNCATE'
  return null
}

export function checkDestructiveCommand(input: ToolHookInput): DestructiveVerdict {
  if (input.tool_name !== 'Bash') return ALLOW
  const command = input.tool_input?.command
  if (typeof command !== 'string') return ALLOW
  const label = findDestructiveOperation(command)
  if (label === null) return ALLOW
  return {
    decision: 'deny',
    reason:
      `forge guard: \`${label}\` is a destructive operation and is denied (also when wrapped in ` +
      'env/sudo/timeout/xargs/sh -c/heredoc). Use a non-destructive alternative, or ask the user to run it.',
  }
}

export type SurfaceFile = { readonly root: string; readonly globs: readonly string[] }

function parseSurfaceGlobs(raw: unknown): string[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as { surfaces?: unknown }).surfaces
      : null
  if (!Array.isArray(list)) return null
  return list.filter((entry): entry is string => typeof entry === 'string')
}

/** Walks up from `cwd` for `.forge/surface.json`; a missing or unreadable file means no restriction. */
export function loadSurfaceFile(cwd: string): SurfaceFile | null {
  let current = path.resolve(cwd)
  for (let hop = 0; hop < 12; hop++) {
    const candidate = path.join(current, '.forge', 'surface.json')
    if (existsSync(candidate)) {
      try {
        const globs = parseSurfaceGlobs(JSON.parse(readFileSync(candidate, 'utf8')))
        return globs ? { root: current, globs } : null
      } catch {
        return null
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export function checkEditSurface(
  input: ToolHookInput,
  loadSurface: (cwd: string) => SurfaceFile | null = loadSurfaceFile,
): DestructiveVerdict {
  if (!input.tool_name || !EDIT_TOOLS.has(input.tool_name)) return ALLOW
  if (!input.cwd) return ALLOW
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string') return ALLOW

  const surface = loadSurface(input.cwd)
  if (!surface) return ALLOW

  const relative = path.relative(surface.root, path.resolve(input.cwd, target))
  const inside = !relative.startsWith('..') && !path.isAbsolute(relative)
  const allowed =
    inside &&
    (relative.startsWith(`.forge${path.sep}`) ||
      surface.globs.some((glob) => new Bun.Glob(glob).match(relative)))
  if (allowed) return ALLOW

  return {
    decision: 'deny',
    reason:
      `forge guard: ${target} is outside this ticket's allowed edit surfaces ` +
      `(${surface.globs.join(', ') || 'none'}, from .forge/surface.json). Edit only allowed files, ` +
      'or ask the coordinator to widen the surface.',
  }
}
