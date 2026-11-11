import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { BINARY, LEGACY_RUN_DIR, RUN_DIR } from "./names";

const RUN_DIRECTORIES: readonly string[] = [RUN_DIR, LEGACY_RUN_DIR];

export type DestructiveVerdict =
  | { readonly decision: "allow" }
  | { readonly decision: "deny"; readonly reason: string };

type ToolHookInput = {
  readonly tool_name?: string;
  readonly cwd?: string;
  readonly tool_input?: Record<string, unknown>;
  readonly paths?: readonly string[];
};

const ALLOW: DestructiveVerdict = { decision: "allow" };

const SEGMENT_SEPARATOR = /\|\||&&|[;|&\n]/;
const INERT_COMMANDS = new Set(["echo", "printf", "grep", "egrep", "fgrep", "rg", "gh"]);
const WRAPPER_COMMANDS = new Set([
  "env",
  "sudo",
  "doas",
  "timeout",
  "xargs",
  "nice",
  "nohup",
  "command",
  "exec",
  "time",
  "builtin",
  "setsid",
  "stdbuf",
  "ionice",
]);
const SQL_CLIENTS = /\b(psql|mysql|mariadb|sqlite3|sqlcmd|duckdb|clickhouse-client)\b/;

type DestructiveRule = {
  readonly label: string;
  readonly pattern: RegExp;
  /** A safe command that does the same job, appended to the deny reason. */
  readonly alternative?: string;
};

const RULES: readonly DestructiveRule[] = [
  { label: "git reset --hard", pattern: /\bgit\b[^\n]*\breset\b[^\n]*--hard\b/ },
  {
    label: "git clean -f",
    pattern: /\bgit\b[^\n]*\bclean\b[^\n]*(\s-[a-zA-Z]*f[a-zA-Z]*(?=[\s"'`)]|$)|\s--force\b)/,
  },
  {
    label: "git push --force",
    pattern:
      /\bgit\b[^\n]*\bpush\b[^\n]*(\s--force(?![-\w])|\s-[a-zA-Z]*f[a-zA-Z]*(?=[\s"'`)]|$)|\s\+\S)/,
  },
  {
    label: "git branch -D",
    pattern:
      /\bgit\b[^\n]*\bbranch\b[^\n]*(\s-[a-zA-Z]*D[a-zA-Z]*(?=[\s"'`)]|$)|\s--delete\s+--force)/,
    alternative: `\`${BINARY} cleanup\` deletes the branches whose pull request merged`,
  },
  {
    label: "rm -r",
    pattern:
      /(?:^|[\s;&|("'`/\\])rm\s(?:[^\n]*\s)?(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?=\s|$|["'`)])/,
  },
];

const SQL_UPPERCASE =
  /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN)|TRUNCATE\s+(?:TABLE\s+)?[A-Za-z_"`])/;
const SQL_ANY_CASE = new RegExp(SQL_UPPERCASE.source, "i");

function leadingCommandWord(segment: string): string {
  const words = segment.trim().split(/\s+/);
  for (const word of words) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue;
    if (word.startsWith("-")) continue;
    const base = path.basename(word.replace(/^["'(]+/, ""));
    if (WRAPPER_COMMANDS.has(base)) continue;
    if (/^\d+[smhd]?$/.test(base)) continue;
    return base;
  }
  return "";
}

function isInertSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (/^git\s+commit\b/.test(trimmed)) return true;
  return INERT_COMMANDS.has(leadingCommandWord(segment));
}

const PIPED_TO_SHELL = /\|\s*(?:(?:sudo|env|doas)\s+)*(?:\S*\/)?(?:ba|z|da|k)?sh\b/;

function substitutionBodies(segment: string): string[] {
  const bodies: string[] = [];
  for (const match of segment.matchAll(/\$\(([^)]*)/g)) bodies.push(match[1] ?? "");
  for (const match of segment.matchAll(/`([^`]*)`/g)) bodies.push(match[1] ?? "");
  return bodies;
}

function matchRules(segment: string): string | null {
  for (const rule of RULES) {
    if (rule.pattern.test(segment)) return rule.label;
  }
  return SQL_UPPERCASE.test(segment) ? "DROP/TRUNCATE" : null;
}

/** Returns the matched rule's label when `command` contains a destructive operation, even wrapped. */
export function findDestructiveOperation(command: string): string | null {
  const pipedToShell = PIPED_TO_SHELL.test(command);
  let heredocTerminator: string | null = null;
  let skipHeredocBody = false;
  for (const line of command.split("\n")) {
    if (heredocTerminator !== null) {
      if (line.trim() === heredocTerminator) heredocTerminator = null;
      else if (skipHeredocBody) continue;
    }
    const inBody = heredocTerminator !== null;
    for (const segment of inBody ? [line] : line.split(SEGMENT_SEPARATOR)) {
      if (segment.trim().length === 0) continue;
      if (!inBody && isInertSegment(segment) && !pipedToShell) {
        for (const body of substitutionBodies(segment)) {
          const found = findDestructiveOperation(body);
          if (found) return found;
        }
        continue;
      }
      const label = matchRules(segment);
      if (label) return label;
    }
    if (!inBody) {
      const opener = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
      if (opener) {
        heredocTerminator = opener[2] ?? null;
        const openerSegment =
          line.split(SEGMENT_SEPARATOR).find((candidate) => candidate.includes(opener[0])) ?? line;
        skipHeredocBody = !pipedToShell && isInertSegment(openerSegment);
      }
    }
  }
  if (SQL_CLIENTS.test(command) && SQL_ANY_CASE.test(command)) return "DROP/TRUNCATE";
  return null;
}

export function checkDestructiveCommand(input: ToolHookInput): DestructiveVerdict {
  if (input.tool_name !== "Bash") return ALLOW;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return ALLOW;
  const label = findDestructiveOperation(command);
  if (label === null) return ALLOW;
  const alternative = RULES.find((rule) => rule.label === label)?.alternative;
  const advice =
    alternative === undefined
      ? "Use a non-destructive alternative, or ask the user to run it."
      : `Use a non-destructive alternative (${alternative}), or ask the user to run it.`;
  return {
    decision: "deny",
    reason:
      `${BINARY} guard: \`${label}\` is a destructive operation and is denied (also when wrapped in ` +
      `env/sudo/timeout/xargs/sh -c/heredoc). ${advice}`,
  };
}

export type SurfaceFile = {
  readonly root: string;
  readonly globs: readonly string[];
  /** Where the globs came from, relative to `root`; defaults to `.emet/surface.json`. */
  readonly source?: string;
};

function parseSurfaceGlobs(raw: unknown): string[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (raw as { surfaces?: unknown }).surfaces
      : null;
  if (!Array.isArray(list)) return null;
  return list.filter((entry): entry is string => typeof entry === "string");
}

/** `<directory>/.emet/surface.json`, then the legacy `.forge/surface.json`, when either exists. */
function findSurfaceCandidate(directory: string): string | undefined {
  return RUN_DIRECTORIES.map((runDirectory) =>
    path.join(directory, runDirectory, "surface.json"),
  ).find((candidate) => existsSync(candidate));
}

/**
 * Walks up from `cwd` for `.emet/surface.json`, or the legacy
 * `.forge/surface.json`; a missing or unreadable file means no restriction.
 */
function loadSurfaceFile(cwd: string): SurfaceFile | null {
  let current = path.resolve(cwd);
  for (let hop = 0; hop < 12; hop++) {
    const candidate = findSurfaceCandidate(current);
    if (candidate) {
      try {
        const globs = parseSurfaceGlobs(JSON.parse(readFileSync(candidate, "utf8")));
        return globs ? { root: current, globs, source: path.relative(current, candidate) } : null;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function editTargets(input: ToolHookInput): readonly string[] | null {
  if (input.tool_name === "apply_patch") return input.paths ?? null;
  if (!input.tool_name || !EDIT_TOOLS.has(input.tool_name)) return null;
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  return typeof target === "string" ? [target] : null;
}

export function checkEditSurface(
  input: ToolHookInput,
  loadSurface: (cwd: string) => SurfaceFile | null = loadSurfaceFile,
): DestructiveVerdict {
  const targets = editTargets(input);
  if (!targets || !input.cwd) return ALLOW;

  const surface = loadSurface(input.cwd);
  if (!surface) return ALLOW;

  const cwd = input.cwd;
  for (const target of targets) {
    const relative = path.relative(surface.root, path.resolve(cwd, target));
    const inside = !relative.startsWith("..") && !path.isAbsolute(relative);
    const allowed =
      inside &&
      (RUN_DIRECTORIES.some((runDirectory) => relative.startsWith(`${runDirectory}${path.sep}`)) ||
        surface.globs.some((glob) => new Bun.Glob(glob).match(relative)));
    if (!allowed) {
      return {
        decision: "deny",
        reason:
          `${BINARY} guard: ${target} is outside this ticket's allowed edit surfaces ` +
          `(${surface.globs.join(", ") || "none"}, from ${surface.source ?? `${RUN_DIR}/surface.json`}). Edit only allowed files, ` +
          "or ask the coordinator to widen the surface.",
      };
    }
  }
  return ALLOW;
}
