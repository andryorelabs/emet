import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { TreeSource } from "./assets";
import { type JsonObject, mergeClaudeHooks, standaloneExtraHooks } from "./hooks-merge";
import { BINARY } from "./names";
import type { HostContext, HostResult } from "./self-types";

/** The installer's SHA-256 manifest, relative to the home directory. */
const MANIFEST_RELATIVE_PATH = ".claude/emet/.install-manifest.json";

/** Claude Code's user settings, relative to the home directory. */
const SETTINGS_RELATIVE_PATH = ".claude/settings.json";

/** The tree file holding the plugin's Claude Code hook definitions. */
const HOOK_DEFINITIONS_PATH = "hooks/hooks.json";

/** The infix of a settings backup's name, shared with `emet uninstall`. */
const SETTINGS_BACKUP_INFIX = ".pre-emet-guard-backup.";

/** How many settings backups survive a write. */
const SETTINGS_BACKUPS_TO_KEEP = 5;
/** Tree directory to home-relative install directory, for every prompt the Claude host installs. */
const PROMPT_DESTINATIONS: readonly (readonly [string, string])[] = [
  ["emet/reference/", ".claude/emet/reference/"],
  ["commands/", ".claude/commands/emet/"],
  ["agents/", ".claude/agents/"],
];

/** Files an earlier install shipped that emet no longer loads; a leftover copy is moved aside. */
const RETIRED_PATHS: readonly string[] = [".claude/emet/reference/phases-8-closeout.md"];

/** The placeholder Claude Code expands to the plugin root in plugin prompts. */
const PLUGIN_ROOT_PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";

/** The rewrites applied to every prompt for a user-level install, in this order. */
const PROMPT_REWRITES: readonly (readonly [string, string])[] = [
  [PLUGIN_ROOT_PLACEHOLDER, "$HOME/.claude"],
  ["emet:emet-worker", "emet-worker"],
  ["emet:emet-reviewer", "emet-reviewer"],
];

const TREE_DIRECTORIES: readonly string[] = ["commands", "agents", "emet/reference"];

const TREE_FILES: readonly string[] = [
  "hooks/hooks.json",
  "codex/hooks.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
];

/**
 * Rewrites a plugin prompt for a user-level install: `${CLAUDE_PLUGIN_ROOT}` becomes the literal
 * `$HOME/.claude` (the model resolves it, see the C3 spike) and `emet:emet-worker` and
 * `emet:emet-reviewer` lose their plugin prefix.
 */
export function rewritePrompt(text: string): string {
  return PROMPT_REWRITES.reduce(
    (rewritten, [placeholder, replacement]) => rewritten.replaceAll(placeholder, replacement),
    text,
  );
}

/** Lists the files under `directory` as sorted root-relative paths, descending when `deep`. */
function listFiles(root: string, directory: string, deep: boolean): string[] {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return deep ? listFiles(root, relative, deep) : [];
      return [relative];
    })
    .toSorted();
}

/** The install tree read from a checkout at `root`, listing the same files `embeddedTree` holds. */
export function checkoutTree(root: string): TreeSource {
  const paths = [
    ...TREE_DIRECTORIES.flatMap((directory) =>
      listFiles(root, directory, false).filter((file) => file.endsWith(".md")),
    ),
    ...TREE_FILES.filter((file) => existsSync(path.join(root, file))),
    ...listFiles(root, "codex/skills", true),
  ].toSorted();
  const known = new Set(paths);
  return {
    list: () => paths,
    read(relativePath) {
      if (!known.has(relativePath)) {
        throw new Error(`${BINARY}: unknown tree file "${relativePath}" in ${root}`);
      }
      return readFileSync(path.join(root, relativePath), "utf8");
    },
  };
}

/** One change to the home directory, planned before anything is written. */
type InstallStep =
  | { kind: "write"; target: string; content: string; mode?: number }
  | { kind: "remove"; target: string }
  | { kind: "move"; from: string; target: string }
  | { kind: "copy"; from: string; target: string };

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashOnDisk(absolutePath: string): string | undefined {
  if (!existsSync(absolutePath)) return undefined;
  return sha256(readFileSync(absolutePath));
}

/** The home-relative destination of a tree file, or undefined when the Claude host does not install it. */
export function promptDestinationOf(treePath: string): string | undefined {
  if (!treePath.endsWith(".md")) return undefined;
  for (const [treeDirectory, installDirectory] of PROMPT_DESTINATIONS) {
    const name = treePath.slice(treeDirectory.length);
    if (treePath.startsWith(treeDirectory) && name.length > 0 && !name.includes("/")) {
      return `${installDirectory}${name}`;
    }
  }
  return undefined;
}

function isOwnedByClaudeHost(relativePath: string): boolean {
  return PROMPT_DESTINATIONS.some(([, installDirectory]) =>
    relativePath.startsWith(installDirectory),
  );
}

/** The staged files: home-relative path to rewritten content. */
function stageTree(tree: TreeSource): ReadonlyMap<string, string> {
  const staged = new Map<string, string>();
  for (const treePath of tree.list()) {
    const destination = promptDestinationOf(treePath);
    if (destination !== undefined) staged.set(destination, rewritePrompt(tree.read(treePath)));
  }
  return staged;
}

/** The previous manifest's entries; throws naming the file when it is not an object of path to hash. */
function readManifest(manifestPath: string): ReadonlyMap<string, string> {
  if (!existsSync(manifestPath)) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`${manifestPath}: invalid JSON (${String(error)})`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${manifestPath}: expected an object of path to hash`);
  }
  const entries = new Map<string, string>();
  for (const [relativePath, hash] of Object.entries(parsed)) {
    if (typeof hash !== "string")
      throw new Error(`${manifestPath}: invalid entry "${relativePath}"`);
    entries.set(relativePath, hash);
  }
  return entries;
}

/** Renders the manifest: byte-sorted keys, two-space indent, trailing newline. */
function renderManifest(entries: ReadonlyMap<string, string>): string {
  const lines = [...entries]
    .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([relativePath, hash]) => `  "${relativePath}": "${hash}"`);
  return `{\n${lines.length > 0 ? `${lines.join(",\n")}\n` : ""}}\n`;
}

interface InstallPlan {
  steps: InstallStep[];
  notes: string[];
}

/** Plans the staged files against what is on disk and in the manifest. */
function planStagedFiles(
  home: string,
  staged: ReadonlyMap<string, string>,
  previous: ReadonlyMap<string, string>,
  entries: Map<string, string>,
  plan: InstallPlan,
): void {
  for (const [relativePath, content] of staged) {
    const destination = path.join(home, relativePath);
    const pending = `${destination}.new`;
    const newHash = sha256(content);
    const recordedHash = previous.get(relativePath);
    const currentHash = hashOnDisk(destination);
    entries.set(relativePath, newHash);
    if (currentHash === undefined) {
      plan.steps.push({ kind: "write", target: destination, content });
    } else if (currentHash === newHash) {
      if (existsSync(pending)) plan.steps.push({ kind: "remove", target: pending });
    } else if (recordedHash !== undefined && currentHash !== recordedHash) {
      if (hashOnDisk(pending) !== newHash) {
        plan.steps.push({ kind: "write", target: pending, content });
      }
      entries.set(relativePath, recordedHash);
      plan.notes.push(
        `~/${relativePath} was edited since the last install, so your version was kept (new version at ~/${relativePath}.new)`,
      );
    } else {
      plan.steps.push({ kind: "write", target: destination, content });
      if (existsSync(pending)) plan.steps.push({ kind: "remove", target: pending });
    }
  }
}

/**
 * Plans the previous manifest's entries the Claude host no longer ships: unedited ones are removed,
 * edited ones are kept and listed. Entries it does not own (a source install's CLI files) are carried
 * over untouched for the step that owns them.
 */
function planUnshippedFiles(
  home: string,
  staged: ReadonlyMap<string, string>,
  previous: ReadonlyMap<string, string>,
  entries: Map<string, string>,
  plan: InstallPlan,
): void {
  for (const [relativePath, recordedHash] of previous) {
    if (staged.has(relativePath)) continue;
    if (!isOwnedByClaudeHost(relativePath)) {
      entries.set(relativePath, recordedHash);
      continue;
    }
    const absolutePath = path.join(home, relativePath);
    const currentHash = hashOnDisk(absolutePath);
    if (currentHash === undefined) continue;
    if (currentHash === recordedHash) {
      plan.steps.push({ kind: "remove", target: absolutePath });
      if (existsSync(`${absolutePath}.new`)) {
        plan.steps.push({ kind: "remove", target: `${absolutePath}.new` });
      }
    } else if (!RETIRED_PATHS.includes(relativePath)) {
      plan.notes.push(
        `~/${relativePath} is no longer shipped but was edited since the last install, so it was kept`,
      );
    }
  }
}

/** Retired files are moved aside even when edited or untracked, since a stale one would be loaded. */
function planRetiredFiles(
  home: string,
  staged: ReadonlyMap<string, string>,
  plan: InstallPlan,
): void {
  const removed = new Set(
    plan.steps.filter((step) => step.kind === "remove").map((step) => step.target),
  );
  for (const relativePath of RETIRED_PATHS) {
    const absolutePath = path.join(home, relativePath);
    if (staged.has(relativePath) || removed.has(absolutePath) || !existsSync(absolutePath))
      continue;
    plan.steps.push({ kind: "move", from: absolutePath, target: `${absolutePath}.retired` });
    if (existsSync(`${absolutePath}.new`)) {
      plan.steps.push({ kind: "remove", target: `${absolutePath}.new` });
    }
    plan.notes.push(
      `~/${relativePath} is no longer shipped and was moved to ~/${relativePath}.retired`,
    );
  }
}

function applyStep(step: InstallStep): void {
  if (step.kind === "remove") {
    rmSync(step.target, { force: true });
    return;
  }
  mkdirSync(path.dirname(step.target), { recursive: true });
  if (step.kind === "move") {
    renameSync(step.from, step.target);
    return;
  }
  if (step.kind === "copy") {
    copyFileSync(step.from, step.target);
    return;
  }
  const temporary = `${step.target}.tmp-${process.pid}`;
  writeFileSync(temporary, step.content);
  if (step.mode !== undefined) chmodSync(temporary, step.mode);
  renameSync(temporary, step.target);
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

/** `2026-11-23T21:30:05.123Z` as `20261123T213005Z`, the backup suffix. */
function backupTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[-:]/g, "");
}

/** The backup step for `settingsPath` and the removal of every backup beyond the newest few. */
function planSettingsBackup(settingsPath: string, now: Date, plan: InstallPlan): void {
  const directory = path.dirname(settingsPath);
  const prefix = `${path.basename(settingsPath)}${SETTINGS_BACKUP_INFIX}`;
  const backupPath = `${settingsPath}${SETTINGS_BACKUP_INFIX}${backupTimestamp(now)}`;
  plan.steps.push({ kind: "copy", from: settingsPath, target: backupPath });
  const existing = readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(directory, name));
  const stale = [...new Set([...existing, backupPath])]
    .toSorted()
    .toReversed()
    .slice(SETTINGS_BACKUPS_TO_KEEP);
  for (const target of stale) plan.steps.push({ kind: "remove", target });
}

/**
 * Plans the merge of the embedded hook definitions and `standaloneExtraHooks` into
 * `~/.claude/settings.json`, with commands on the `emetBin` symlink. An existing file is backed
 * up first and written in place through a symlink, keeping its mode; nothing is planned when no
 * hook is missing. Throws naming the file when it is not a JSON object.
 */
function planSettings(context: HostContext, plan: InstallPlan): readonly string[] {
  const settingsPath = path.join(context.home, SETTINGS_RELATIVE_PATH);
  const exists = existsSync(settingsPath);
  const text = exists ? readFileSync(settingsPath, "utf8") : "";
  const current = text.trim() === "" ? {} : parseJsonObject(text, settingsPath);
  const embedded = context.tree.list().includes(HOOK_DEFINITIONS_PATH)
    ? parseJsonObject(context.tree.read(HOOK_DEFINITIONS_PATH), HOOK_DEFINITIONS_PATH)
    : {};
  const withEmbedded = mergeClaudeHooks(current, embedded, context.emetBin);
  const withExtras = mergeClaudeHooks(
    withEmbedded.settings,
    standaloneExtraHooks(context.emetBin),
    context.emetBin,
  );
  const content = `${JSON.stringify(withExtras.settings, null, 2)}\n`;
  if (exists && JSON.stringify(withExtras.settings) === JSON.stringify(current)) return [];
  if (!exists && withEmbedded.added.length + withExtras.added.length === 0) return [];
  if (exists) planSettingsBackup(settingsPath, context.now(), plan);
  const target =
    exists && lstatSync(settingsPath).isSymbolicLink() ? realpathSync(settingsPath) : settingsPath;
  const mode = exists ? statSync(target).mode & 0o7777 : undefined;
  plan.steps.push(
    mode === undefined
      ? { kind: "write", target, content }
      : { kind: "write", target, content, mode },
  );
  return [...withEmbedded.added, ...withExtras.added];
}

/**
 * Installs the Claude Code files from `context.tree` under `context.home`: the reference prompts
 * in `~/.claude/emet/reference/`, the `/emet:*` commands in `~/.claude/commands/emet/`, the agents
 * in `~/.claude/agents/` and the SHA-256 `.install-manifest.json`, then merges the embedded hooks
 * into `~/.claude/settings.json` after a backup. A file edited since the last install is kept and
 * the new version written beside it as `<file>.new`; a re-run writes nothing; under `dryRun`
 * nothing is written, `writes` lists what would be and each planned hook is logged. Everything is
 * planned before anything is written, so an invalid manifest or settings file writes nothing.
 */
export function installClaudeHost(context: HostContext): HostResult {
  const manifestPath = path.join(context.home, MANIFEST_RELATIVE_PATH);
  const staged = stageTree(context.tree);
  const previous = readManifest(manifestPath);
  const entries = new Map<string, string>();
  const plan: InstallPlan = { steps: [], notes: [] };
  planStagedFiles(context.home, staged, previous, entries, plan);
  planUnshippedFiles(context.home, staged, previous, entries, plan);
  planRetiredFiles(context.home, staged, plan);
  const manifest = renderManifest(entries);
  const currentManifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined;
  if (manifest !== currentManifest) {
    plan.steps.push({ kind: "write", target: manifestPath, content: manifest });
  }
  const addedHooks = planSettings(context, plan);

  if (context.dryRun) {
    for (const command of addedHooks) context.log(`would add hook: ${command}`);
  } else {
    for (const step of plan.steps) applyStep(step);
  }
  for (const note of plan.notes) context.log(`note: ${note}`);
  const writes = plan.steps.flatMap((step) =>
    step.kind === "move" ? [step.from, step.target] : [step.target],
  );
  return {
    host: "claude",
    status: writes.length > 0 ? "installed" : "unchanged",
    writes,
    notes: plan.notes,
  };
}
