import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  type Stats,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { embeddedTree, type TreeSource } from "./assets";
import { readEnv } from "./env";
import { stringifySorted } from "./envelope";
import { exitCodes } from "./exit-codes";
import { type JsonObject, removeEmetHooks } from "./hooks-merge";
import { stateDir } from "./names";
import { errnoCode, errorMessage, isObject } from "./narrow";
import { readInstallState } from "./self-install";
import {
  readLedger,
  removeLedgerEntry,
  replaceLedgerEntry,
  restoreUndo,
  type UndoRecord,
} from "./setupledger";

/** One thing `emet uninstall` does, or would do under `--dry-run`. */
export type UninstallStep =
  | { kind: "remove-file"; path: string }
  | { kind: "keep-edited"; path: string }
  | { kind: "remove-shim"; path: string }
  | { kind: "remove-hooks"; settingsPath: string; count: number }
  | { kind: "remove-dir"; path: string }
  | { kind: "remove-state"; path: string }
  | { kind: "revert-extra"; id: string }
  | { kind: "purge"; path: string }
  | { kind: "note"; text: string };

/** Every host effect `emet uninstall` needs besides the files under `homeDir` and `stateDir`. */
export interface UninstallEnv {
  homeDir: string;
  stateDir: string;
  /** `$CODEX_HOME`; `~/.codex` when undefined. */
  codexHome?: string;
  /** The install tree the Codex skills are compared against; the embedded tree when undefined. */
  tree?: () => TreeSource;
  run(argv: readonly string[]): Promise<number>;
  commandExists(name: string): Promise<boolean>;
  now(): Date;
  log(line: string): void;
  tty: boolean;
  ask(q: string): Promise<string>;
}

/** The parsed `emet uninstall` flags. */
export interface UninstallOptions {
  dryRun: boolean;
  yes: boolean;
  purge: boolean;
  json: boolean;
}

/** Matches a hook command that runs `emet guard`, bare or through any path to the binary. */
export const GUARD_COMMAND_PATTERN = /^(\S*\/)?emet guard( |$)/;

const SHIM_RELATIVE_PATH = ".local/bin/emet";
const PLUGIN_UNINSTALL_COMMAND = "claude plugin uninstall emet@emet-marketplace";
const CODEX_UNINSTALL_COMMAND = "codex plugin remove emet@emet-marketplace";

/** The infix of a hook file backup's name, shared with the installers. */
const HOOKS_BACKUP_INFIX = ".pre-emet-guard-backup.";

/** Tree paths the Codex host writes under `~/.agents/skills/emet/`, keeping their tree path. */
function isCodexSkillTreePath(treePath: string): boolean {
  return (
    treePath === ".codex-plugin/plugin.json" ||
    treePath === "codex/hooks.json" ||
    treePath.startsWith("codex/skills/")
  );
}

interface InstallLayout {
  homeDir: string;
  installDir: string;
  manifestPath: string;
  shimPath: string;
  settingsPath: string;
  versionsDir: string;
  statePath: string;
  codexSkillsDir: string;
  codexHome: string;
  codexHooksPath: string;
}

function layoutFor(env: Pick<UninstallEnv, "homeDir" | "codexHome">): InstallLayout {
  const { homeDir } = env;
  const installDir = path.join(homeDir, ".claude", "emet");
  const shareDir = path.join(homeDir, ".local", "share", "emet");
  const codexHome =
    env.codexHome !== undefined && env.codexHome.length > 0
      ? env.codexHome
      : path.join(homeDir, ".codex");
  return {
    homeDir,
    installDir,
    manifestPath: path.join(installDir, ".install-manifest.json"),
    shimPath: path.join(homeDir, SHIM_RELATIVE_PATH),
    settingsPath: path.join(homeDir, ".claude", "settings.json"),
    versionsDir: path.join(shareDir, "versions"),
    statePath: path.join(shareDir, "install.json"),
    codexSkillsDir: path.join(homeDir, ".agents", "skills", "emet"),
    codexHome,
    codexHooksPath: path.join(codexHome, "hooks.json"),
  };
}

function fileHash(target: string): string {
  return createHash("sha256").update(readFileSync(target)).digest("hex");
}

function readJsonFile(target: string): unknown {
  const text = readFileSync(target, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${target}: invalid JSON (${errorMessage(error)})`, { cause: error });
  }
}

/** The manifest's entries as relative path to SHA-256; an unreadable or malformed manifest throws naming its path. */
function readManifest(manifestPath: string): ReadonlyMap<string, string> {
  const parsed = readJsonFile(manifestPath);
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new Error(`${manifestPath}: expected an object of path to hash`);
  }
  const entries = new Map<string, string>();
  for (const [relativePath, hash] of Object.entries(parsed)) {
    const escapes =
      path.isAbsolute(relativePath) ||
      relativePath.split("/").includes("..") ||
      relativePath === "";
    if (typeof hash !== "string" || escapes) {
      throw new Error(`${manifestPath}: invalid entry "${relativePath}"`);
    }
    entries.set(relativePath, hash);
  }
  return entries;
}

/** `lstat` of `target`, or undefined when nothing is there; any other error throws. */
function lstatOrUndefined(target: string): Stats | undefined {
  try {
    return lstatSync(target);
  } catch (error: unknown) {
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

function isFile(target: string): boolean {
  return lstatOrUndefined(target)?.isFile() === true;
}

function isInside(target: string, directory: string): boolean {
  return target.startsWith(`${directory}${path.sep}`);
}

/**
 * Whether the shim at `shimPath` is safe to remove: a symlink into the install directory, the
 * manifest's wrapper with its recorded hash, or, when the manifest records no shim, a wrapper
 * whose content runs the install.
 */
function shimPointsIntoInstall(
  layout: InstallLayout,
  manifest: ReadonlyMap<string, string>,
): boolean {
  const stat = lstatSync(layout.shimPath);
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(layout.shimPath), readlinkSync(layout.shimPath));
    return isInside(target, layout.installDir) || isInside(target, layout.versionsDir);
  }
  if (!stat.isFile()) return false;
  const recordedHash = manifest.get(SHIM_RELATIVE_PATH);
  if (recordedHash !== undefined) return recordedHash === fileHash(layout.shimPath);
  const content = readFileSync(layout.shimPath, "utf8");
  return (
    content.includes("$HOME/.claude/emet/bin/emet") ||
    content.includes(path.join(layout.installDir, "bin", "emet"))
  );
}

function planManifestFiles(
  homeDir: string,
  manifest: ReadonlyMap<string, string>,
): UninstallStep[] {
  const removals: UninstallStep[] = [];
  const kept: UninstallStep[] = [];
  for (const [relativePath, hash] of [...manifest].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (relativePath === SHIM_RELATIVE_PATH) continue;
    const target = path.join(homeDir, relativePath);
    if (!isFile(target)) continue;
    if (fileHash(target) === hash) removals.push({ kind: "remove-file", path: target });
    else kept.push({ kind: "keep-edited", path: target });
  }
  return [...removals, ...kept];
}

function planShim(layout: InstallLayout, manifest: ReadonlyMap<string, string>): UninstallStep[] {
  if (lstatOrUndefined(layout.shimPath) === undefined) return [];
  if (shimPointsIntoInstall(layout, manifest))
    return [{ kind: "remove-shim", path: layout.shimPath }];
  return [{ kind: "keep-edited", path: layout.shimPath }];
}

function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value) && !Array.isArray(value);
}

/** One `remove-hooks` step when the hook file holds any emet hook command; a malformed file throws naming it. */
function planHooks(settingsPath: string): UninstallStep[] {
  if (!existsSync(settingsPath)) return [];
  const parsed = readJsonFile(settingsPath);
  if (!isJsonObject(parsed)) return [];
  const count = removeEmetHooks(parsed).removed.length;
  return count === 0 ? [] : [{ kind: "remove-hooks", settingsPath, count }];
}

/** Absolute path to SHA-256 of every Codex skill file the tree would install under `layout.codexSkillsDir`. */
function codexSkillHashes(layout: InstallLayout, env: UninstallEnv): ReadonlyMap<string, string> {
  if (lstatOrUndefined(layout.codexSkillsDir)?.isDirectory() !== true) return new Map();
  const tree = (env.tree ?? embeddedTree)();
  return new Map(
    tree
      .list()
      .filter((treePath) => isCodexSkillTreePath(treePath))
      .map((treePath) => [
        path.join(layout.codexSkillsDir, treePath),
        createHash("sha256").update(tree.read(treePath)).digest("hex"),
      ]),
  );
}

/** Removes the Codex skill files that still match the tree; edited ones are kept and listed. */
function planCodexSkills(hashes: ReadonlyMap<string, string>): UninstallStep[] {
  const removals: UninstallStep[] = [];
  const kept: UninstallStep[] = [];
  for (const [target, hash] of [...hashes].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (!isFile(target)) continue;
    if (fileHash(target) === hash) removals.push({ kind: "remove-file", path: target });
    else kept.push({ kind: "keep-edited", path: target });
  }
  return [...removals, ...kept];
}

/** The versions directory and the install state file, when present. */
function planStandalone(layout: InstallLayout): UninstallStep[] {
  const steps: UninstallStep[] = [];
  if (lstatOrUndefined(layout.versionsDir) !== undefined) {
    steps.push({ kind: "remove-dir", path: layout.versionsDir });
  }
  if (lstatOrUndefined(layout.statePath) !== undefined) {
    steps.push({ kind: "remove-state", path: layout.statePath });
  }
  return steps;
}

/** The Setup ledger under the uninstall env's state directory. */
function ledgerFileFor(env: UninstallEnv): string {
  return path.join(env.stateDir, "setup-ledger.json");
}

/** One `revert-extra` step per Setup ledger entry; a malformed ledger throws naming its path. */
function planExtras(env: UninstallEnv): UninstallStep[] {
  return readLedger(ledgerFileFor(env)).map((entry) => ({ kind: "revert-extra", id: entry.id }));
}

function planPurge(env: UninstallEnv): UninstallStep[] {
  return [env.stateDir, path.join(env.homeDir, ".emet")]
    .filter((target) => existsSync(target))
    .map((target) => ({ kind: "purge", path: target }));
}

/** Every step `emet uninstall` would take, computed with read-only probes. */
export async function planUninstall(
  options: UninstallOptions,
  env: UninstallEnv,
): Promise<readonly UninstallStep[]> {
  const layout = layoutFor(env);
  const steps: UninstallStep[] = [];
  const hasManifest = existsSync(layout.manifestPath);
  const manifest = hasManifest ? readManifest(layout.manifestPath) : new Map<string, string>();
  const standalone = readInstallState(env.homeDir) !== null;
  if (hasManifest) {
    steps.push(...planManifestFiles(env.homeDir, manifest));
  } else if (!standalone) {
    steps.push({
      kind: "note",
      text: `no install manifest at ${layout.manifestPath} (a plugin install?): run \`${PLUGIN_UNINSTALL_COMMAND}\``,
    });
  }
  steps.push(...planShim(layout, manifest));
  if (hasManifest) steps.push({ kind: "remove-file", path: layout.manifestPath });
  steps.push(
    ...planHooks(layout.settingsPath),
    ...planCodexSkills(codexSkillHashes(layout, env)),
    ...planHooks(layout.codexHooksPath),
    ...planStandalone(layout),
    ...planExtras(env),
  );
  if (!standalone && (await env.commandExists("codex"))) {
    steps.push({
      kind: "note",
      text: `remove the Codex plugin with \`${CODEX_UNINSTALL_COMMAND}\``,
    });
  }
  if (options.purge) steps.push(...planPurge(env));
  return steps;
}

/** One human-readable line for `step`. */
export function describeStep(step: UninstallStep): string {
  if (step.kind === "note") return `note: ${step.text}`;
  if (step.kind === "remove-hooks") {
    return `remove ${step.count} emet hook(s) from ${step.settingsPath}`;
  }
  if (step.kind === "revert-extra") return `revert extra ${step.id}`;
  const verbs: Record<typeof step.kind, string> = {
    "remove-file": "remove",
    "keep-edited": "keep",
    "remove-shim": "remove shim",
    "remove-dir": "remove directory",
    "remove-state": "remove install state",
    purge: "purge",
  };
  const suffix = step.kind === "keep-edited" ? " (edited since install)" : "";
  return `${verbs[step.kind]} ${step.path}${suffix}`;
}

function backupTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[-:]/g, "");
}

/**
 * The newest installer backup of `hooksPath` whose JSON equals `stripped`, so restoring its bytes
 * undoes the install exactly; undefined when none does. Unreadable backups are skipped.
 */
function matchingInstallBackup(hooksPath: string, stripped: JsonObject): string | undefined {
  const directory = path.dirname(hooksPath);
  const prefix = `${path.basename(hooksPath)}${HOOKS_BACKUP_INFIX}`;
  const expected = JSON.stringify(stripped);
  const candidates = readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .toSorted()
    .toReversed()
    .map((name) => path.join(directory, name));
  return candidates.find((candidate) => {
    try {
      return JSON.stringify(JSON.parse(readFileSync(candidate, "utf8"))) === expected;
    } catch {
      return false;
    }
  });
}

/**
 * Drops every emet hook command from the hook file at `hooksPath`. When an installer backup holds
 * exactly the remaining content its bytes are restored and the backup removed; when nothing remains
 * the file is removed; otherwise the file is backed up and rewritten.
 */
function removeHooksFrom(hooksPath: string, now: Date): void {
  const parsed = readJsonFile(hooksPath);
  if (!isJsonObject(parsed)) throw new Error(`${hooksPath}: expected a JSON object`);
  const { doc: stripped, removed } = removeEmetHooks(parsed);
  if (removed.length === 0) return;
  const backup = matchingInstallBackup(hooksPath, stripped);
  if (backup !== undefined) {
    writeFileSync(hooksPath, readFileSync(backup));
    unlinkSync(backup);
    return;
  }
  if (Object.keys(stripped).length === 0) {
    unlinkSync(hooksPath);
    return;
  }
  copyFileSync(hooksPath, `${hooksPath}${HOOKS_BACKUP_INFIX}${backupTimestamp(now)}`);
  const temporaryPath = `${hooksPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(stripped, null, 2)}\n`);
  renameSync(temporaryPath, hooksPath);
}

/** What executing a step needs beyond the step itself. */
export interface StepContext {
  manifestPath: string;
  hashes: ReadonlyMap<string, string>;
  env: UninstallEnv;
}

function removeManifestFile(target: string, context: StepContext): void {
  if (target !== context.manifestPath) {
    const recorded = context.hashes.get(target);
    if (recorded === undefined) throw new Error(`${target}: not in the install manifest`);
    if (fileHash(target) !== recorded) throw new Error(`${target}: edited since the plan; kept`);
    rmSync(`${target}.new`, { force: true });
  }
  unlinkSync(target);
}

/** Unlinks the shim, refusing a regular file whose hash no longer matches the manifest's entry for it. */
function removeShim(target: string, context: StepContext): void {
  const recorded = context.hashes.get(target);
  if (recorded !== undefined && lstatSync(target).isFile() && fileHash(target) !== recorded)
    throw new Error(`${target}: edited since the plan; kept`);
  unlinkSync(target);
}

/**
 * Reverts every undo record of the ledger entry `id`, logging each warning. When all succeed the
 * entry leaves the ledger; otherwise it stays holding only the records that failed, so a re-run
 * retries just those, and the step throws listing each failure.
 */
async function revertExtra(id: string, env: UninstallEnv): Promise<void> {
  const ledgerFile = ledgerFileFor(env);
  const entry = readLedger(ledgerFile).find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no Setup ledger entry for ${id} in ${ledgerFile}`);
  const unreverted: UndoRecord[] = [];
  const failures: string[] = [];
  for (const record of entry.undo) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: records of one entry may touch the same file
      const { warnings } = await restoreUndo(record, env);
      for (const warning of warnings) env.log(`warning: ${id}: ${warning}`);
    } catch (error: unknown) {
      unreverted.push(record);
      failures.push(errorMessage(error));
    }
  }
  if (unreverted.length === 0) {
    removeLedgerEntry(ledgerFile, id);
    return;
  }
  replaceLedgerEntry(ledgerFile, { ...entry, undo: unreverted });
  throw new Error(failures.join("; "));
}

/** Executes one step; rejects when it fails. */
export async function executeStep(step: UninstallStep, context: StepContext): Promise<void> {
  switch (step.kind) {
    case "remove-file":
      removeManifestFile(step.path, context);
      return;
    case "remove-shim":
      removeShim(step.path, context);
      return;
    case "remove-hooks":
      removeHooksFrom(step.settingsPath, context.env.now());
      return;
    case "remove-dir":
      rmSync(step.path, { recursive: true, force: true });
      return;
    case "remove-state":
      unlinkSync(step.path);
      return;
    case "revert-extra":
      await revertExtra(step.id, context.env);
      return;
    case "purge":
      rmSync(step.path, { recursive: true, force: true });
      return;
    case "keep-edited":
    case "note":
      return;
  }
}

function isEmptyDirectory(directory: string): boolean {
  return lstatOrUndefined(directory)?.isDirectory() === true && readdirSync(directory).length === 0;
}

/** Removes the directories the removed files left empty, walking up but never past the shared roots; returns each failure. */
function pruneEmptyDirectories(removed: readonly string[], layout: InstallLayout): string[] {
  const { homeDir } = layout;
  const failures: string[] = [];
  const protectedDirectories = new Set([
    ...[
      "",
      ".claude",
      ".claude/commands",
      ".claude/agents",
      ".local",
      ".local/bin",
      ".local/share",
      ".agents",
      ".agents/skills",
    ].map((relative) => path.join(homeDir, relative)),
    layout.codexHome,
  ]);
  for (const file of removed) {
    let directory = path.dirname(file);
    try {
      while (
        isInside(directory, homeDir) &&
        !protectedDirectories.has(directory) &&
        isEmptyDirectory(directory)
      ) {
        rmdirSync(directory);
        directory = path.dirname(directory);
      }
    } catch (error: unknown) {
      failures.push(`remove empty directory ${directory}: ${errorMessage(error)}`);
    }
  }
  return failures;
}

function manifestHashes(homeDir: string, manifestPath: string): ReadonlyMap<string, string> {
  if (!existsSync(manifestPath)) return new Map();
  return new Map(
    [...readManifest(manifestPath)].map(([relative, hash]) => [path.join(homeDir, relative), hash]),
  );
}

/** The path an executed step removed, whose emptied parent directories are then pruned. */
function removedPathOf(step: UninstallStep): string | undefined {
  if (
    step.kind === "remove-file" ||
    step.kind === "remove-shim" ||
    step.kind === "remove-dir" ||
    step.kind === "remove-state"
  ) {
    return step.path;
  }
  if (step.kind === "remove-hooks" && !existsSync(step.settingsPath)) return step.settingsPath;
  return undefined;
}

async function confirmed(options: UninstallOptions, env: UninstallEnv): Promise<boolean> {
  if (options.yes) return true;
  if (!env.tty) {
    env.log("No changes made: re-run with --yes to uninstall.");
    return false;
  }
  const answer = await env.ask("Uninstall emet as listed above? [y/N] ");
  if (/^y(es)?$/i.test(answer.trim())) return true;
  env.log("Aborted; nothing changed.");
  return false;
}

/** Plans, confirms and executes `emet uninstall`; `failed` lists each failed step with its error. */
export async function runUninstall(
  options: UninstallOptions,
  env: UninstallEnv,
): Promise<{ steps: readonly UninstallStep[]; failed: readonly string[] }> {
  const steps = await planUninstall(options, env);
  for (const step of steps) env.log(describeStep(step));
  if (options.dryRun || !(await confirmed(options, env))) return { steps, failed: [] };
  const layout = layoutFor(env);
  const context: StepContext = {
    manifestPath: layout.manifestPath,
    hashes: new Map([
      ...manifestHashes(env.homeDir, layout.manifestPath),
      ...codexSkillHashes(layout, env),
    ]),
    env,
  };
  const failed: string[] = [];
  const removed: string[] = [];
  for (const step of steps) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: steps share settings.json and the ledger, and output keeps plan order
      await executeStep(step, context);
      const removedPath = removedPathOf(step);
      if (removedPath !== undefined) removed.push(removedPath);
    } catch (error: unknown) {
      const line = `${describeStep(step)}: ${errorMessage(error)}`;
      failed.push(line);
      env.log(`failed: ${line}`);
    }
  }
  for (const failure of pruneEmptyDirectories(removed, layout)) {
    failed.push(failure);
    env.log(`failed: ${failure}`);
  }
  return { steps, failed };
}

/** Parses the `emet uninstall` argv. */
export function parseUninstallOptions(argv: readonly string[]): UninstallOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    purge: argv.includes("--purge"),
    json: argv.includes("--json"),
  };
}

async function spawnInherited(argv: readonly string[]): Promise<number> {
  const child = Bun.spawn([...argv], { stdio: ["inherit", "inherit", "inherit"] });
  return child.exited;
}

/** `{ codexHome }` when `CODEX_HOME` is set, so an unset variable leaves the default `~/.codex`. */
function optionalCodexHome(codexHome: string | undefined): Pick<UninstallEnv, "codexHome"> {
  return codexHome === undefined ? {} : { codexHome };
}

/** The real host env for `emet uninstall`. */
export async function realUninstallEnv(
  json: boolean,
): Promise<{ env: UninstallEnv; close: () => void }> {
  const { createPrompter } = await import("./setup");
  /** Node types `isTTY` as boolean, but it is undefined when stdin is not a terminal. */
  const stdinIsTty: unknown = process.stdin.isTTY;
  const tty = !json && stdinIsTty === true;
  const prompter = tty ? createPrompter(process.stdin, process.stdout) : undefined;
  return {
    env: {
      homeDir: os.homedir(),
      stateDir: stateDir(),
      ...optionalCodexHome(readEnv("CODEX_HOME")),
      run: spawnInherited,
      commandExists: (name) => Promise.resolve(Bun.which(name) !== null),
      now: () => new Date(),
      log: (line) => {
        if (json) console.error(line);
        else console.log(line);
      },
      tty,
      ask: prompter?.ask ?? (() => Promise.resolve("")),
    },
    close: () => {
      prompter?.close();
    },
  };
}

/** Runs `emet uninstall` on `env` and prints the result; returns the exit code. */
export async function runCommand(
  options: UninstallOptions,
  env: UninstallEnv,
  output: { out: (line: string) => void; err: (line: string) => void },
): Promise<number> {
  try {
    const result = await runUninstall(options, env);
    if (options.json) output.out(stringifySorted(result));
    return result.failed.length > 0 ? exitCodes.findings : exitCodes.success;
  } catch (error: unknown) {
    output.err(errorMessage(error));
    return exitCodes.findings;
  }
}

/** `runCommand`'s output on the real console. */
export const CONSOLE_OUTPUT = {
  out: (line: string): void => {
    console.log(line);
  },
  err: (line: string): void => {
    console.error(line);
  },
};

/** Entry point for `emet uninstall`; exits 1 when any step failed or the plan could not be read. */
export async function run(argv: string[]): Promise<void> {
  const options = parseUninstallOptions(argv);
  const { env, close } = await realUninstallEnv(options.json);
  try {
    process.exitCode = await runCommand(options, env, CONSOLE_OUTPUT);
  } finally {
    close();
  }
}
