import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readEnv } from "./env";
import { type JsonObject, mergeCodexHooks } from "./hooks-merge";
import { BINARY } from "./names";
import type { HostContext, HostResult } from "./self-types";

/** The tree file holding the plugin's Codex hook definitions. */
const HOOK_DEFINITIONS_PATH = "codex/hooks.json";

/** The tree file Codex reads to namespace the skills as `$emet:<skill>` (spike C2). */
const MANIFEST_TREE_PATH = ".codex-plugin/plugin.json";

/** Where the namespaced skill directory lives, relative to the home directory (spike C2). */
const SKILLS_RELATIVE_DIRECTORY = ".agents/skills/emet";

/** The tree prefix of the skill files. */
const SKILLS_TREE_PREFIX = "codex/skills/";

/** The one-time step Codex requires before it runs a user hook. */
const TRUST_STEP =
  "open Codex and run /hooks once to review and trust the emet hooks; until then Codex skips them";

/** The Codex home: `CODEX_HOME` when set, otherwise `~/.codex`. */
function codexHomeOf(home: string): string {
  return readEnv("CODEX_HOME") ?? path.join(home, ".codex");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses `text` as a JSON object; throws naming `filePath` on invalid JSON or another shape. */
function parseJsonObject(text: string, filePath: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${String(error)}); it was left unchanged`, {
      cause: error,
    });
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`${filePath}: expected a JSON object; it was left unchanged`);
  }
  return parsed;
}

interface PlannedWrite {
  target: string;
  content: string;
}

/** The skill files and the manifest that differ from what is on disk, as absolute writes. */
function planSkillWrites(context: HostContext): PlannedWrite[] {
  const root = path.join(context.home, SKILLS_RELATIVE_DIRECTORY);
  const treePaths = context.tree
    .list()
    .filter(
      (treePath) => treePath === MANIFEST_TREE_PATH || treePath.startsWith(SKILLS_TREE_PREFIX),
    );
  return treePaths
    .map((treePath) => ({
      target: path.join(root, treePath),
      content: context.tree.read(treePath),
    }))
    .filter(
      ({ target, content }) => !existsSync(target) || readFileSync(target, "utf8") !== content,
    );
}

/**
 * Plans the append of the embedded Codex hooks after the existing entries of
 * `<codexHome>/hooks.json`, with commands on the `emetBin` symlink. Throws naming the file when it
 * is not a JSON object. Returns no write when every hook is already present.
 */
function planHooks(
  context: HostContext,
  codexHome: string,
): { write: PlannedWrite | undefined; added: readonly string[] } {
  if (!context.tree.list().includes(HOOK_DEFINITIONS_PATH)) return { write: undefined, added: [] };
  const hooksPath = path.join(codexHome, "hooks.json");
  const text = existsSync(hooksPath) ? readFileSync(hooksPath, "utf8") : "";
  const current = text.trim() === "" ? {} : parseJsonObject(text, hooksPath);
  const definitions = parseJsonObject(
    context.tree.read(HOOK_DEFINITIONS_PATH),
    HOOK_DEFINITIONS_PATH,
  );
  const { hooksJson, added } = mergeCodexHooks(current, definitions, context.emetBin);
  if (added.length === 0) return { write: undefined, added };
  return {
    write: { target: hooksPath, content: `${JSON.stringify(hooksJson, null, 2)}\n` },
    added,
  };
}

function applyWrite({ target, content }: PlannedWrite): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, target);
}

/**
 * Installs the emet skills and hooks for Codex. Codex is present when its home directory
 * (`CODEX_HOME`, default `~/.codex`) exists; otherwise nothing is written and one line says so.
 * The skills go to `~/.agents/skills/emet/` as a real directory with `.codex-plugin/plugin.json`
 * and `codex/skills/**`, which Codex names `$emet:run` and so on (spike C2). The embedded hooks are
 * appended after the existing entries of `<codexHome>/hooks.json`. `config.toml` is never touched.
 * Everything is planned before anything is written; under `dryRun` nothing is.
 */
export function installCodexHost(context: HostContext): HostResult {
  const codexHome = codexHomeOf(context.home);
  if (!existsSync(codexHome)) {
    const note = `Codex not found at ${codexHome}; ${BINARY} skipped it`;
    context.log(`codex: ${note}`);
    return { host: "codex", status: "skipped", writes: [], notes: [note] };
  }
  const skillWrites = planSkillWrites(context);
  const hooks = planHooks(context, codexHome);
  const planned = hooks.write === undefined ? skillWrites : [...skillWrites, hooks.write];
  if (context.dryRun) {
    for (const command of hooks.added) context.log(`would add Codex hook: ${command}`);
  } else {
    for (const write of planned) applyWrite(write);
  }
  const notes = hooks.added.length > 0 ? [TRUST_STEP] : [];
  for (const note of notes) context.log(`codex: ${note}`);
  return {
    host: "codex",
    status: planned.length > 0 ? "installed" : "unchanged",
    writes: planned.map((write) => write.target),
    notes,
  };
}
