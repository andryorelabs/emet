import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const PRODUCT = "emet";
export const BINARY = "emet";
export const CONFIG_FILE = "emet.config.json";
export const LEGACY_CONFIG_FILE = "forge.config.json";
export const RUN_DIR = ".emet";
export const LEGACY_RUN_DIR = ".forge";
export const AGENTS_DOC = "docs/agents/emet.md";
export const LEGACY_AGENTS_DOC = "docs/agents/forge.md";
export const TODO_MARKER = "TODO(emet):";
const LEGACY_TODO_MARKER = "TODO(forge):";
export const TODO_MARKERS: readonly string[] = [TODO_MARKER, LEGACY_TODO_MARKER];
export const LOCK_TOKEN = "emet";
const LEGACY_LOCK_TOKEN = "forge";
export const LOCK_TOKENS: readonly string[] = [LOCK_TOKEN, LEGACY_LOCK_TOKEN];
export const WORKER_AGENT = "emet-worker";
export const REVIEWER_AGENT = "emet-reviewer";
const ENV_PREFIX = "EMET_";
const LEGACY_ENV_PREFIX = "FORGE_";

/** A name resolved on disk and whether it was the legacy spelling. */
export interface ResolvedPath {
  readonly path: string;
  readonly legacy: boolean;
}

const warnedNames = new Set<string>();

/**
 * Prints `emet: using legacy <name>; run \`emet migrate\`` to stderr, once per
 * name per process.
 */
export function warnLegacy(name: string): void {
  if (warnedNames.has(name)) return;
  warnedNames.add(name);
  process.stderr.write(`${BINARY}: using legacy ${name}; run \`${BINARY} migrate\`\n`);
}

function resolveFirst(root: string, current: string, legacy: string): ResolvedPath | undefined {
  const currentPath = path.join(root, current);
  if (fs.existsSync(currentPath)) return { path: currentPath, legacy: false };
  const legacyPath = path.join(root, legacy);
  if (fs.existsSync(legacyPath)) {
    warnLegacy(legacy);
    return { path: legacyPath, legacy: true };
  }
  return undefined;
}

/** `emet.config.json` first, then `forge.config.json`; undefined when neither exists. */
export function resolveConfigPath(root: string): ResolvedPath | undefined {
  return resolveFirst(root, CONFIG_FILE, LEGACY_CONFIG_FILE);
}

/** `.emet/` first, then `.forge/`; the new directory when neither exists. */
export function resolveRunDir(root: string): ResolvedPath {
  return (
    resolveFirst(root, RUN_DIR, LEGACY_RUN_DIR) ?? {
      path: path.join(root, RUN_DIR),
      legacy: false,
    }
  );
}

/** `docs/agents/emet.md` first, then `docs/agents/forge.md`; undefined when neither exists. */
export function resolveAgentsDoc(root: string): ResolvedPath | undefined {
  return resolveFirst(root, AGENTS_DOC, LEGACY_AGENTS_DOC);
}

/**
 * Reads `EMET_<key>`, then `FORGE_<key>` (warning once). Empty values count as
 * unset.
 */
export function readEnv(key: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const current = env[`${ENV_PREFIX}${key}`];
  if (current) return current;
  const legacyName = `${LEGACY_ENV_PREFIX}${key}`;
  const legacy = env[legacyName];
  if (legacy) {
    warnLegacy(legacyName);
    return legacy;
  }
  return undefined;
}

/** `$EMET_STATE_DIR`, then `$XDG_STATE_HOME/emet`, then `~/.local/state/emet`. */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = readEnv("STATE_DIR", env);
  if (explicit) return explicit;
  const xdgStateHome = env.XDG_STATE_HOME;
  if (xdgStateHome) return path.join(xdgStateHome, PRODUCT);
  return path.join(os.homedir(), ".local", "state", PRODUCT);
}

/** The pre-rename state dir, `$XDG_STATE_HOME/forge` or `~/.local/state/forge`. */
export function legacyStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdgStateHome = env.XDG_STATE_HOME;
  if (xdgStateHome) return path.join(xdgStateHome, LEGACY_LOCK_TOKEN);
  return path.join(os.homedir(), ".local", "state", LEGACY_LOCK_TOKEN);
}
