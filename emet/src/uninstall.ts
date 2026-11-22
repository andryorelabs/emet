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

import { stringifySorted } from "./envelope";
import { exitCodes } from "./exit-codes";
import { stateDir } from "./names";
import { errnoCode, errorMessage, isObject } from "./narrow";

/** One thing `emet uninstall` does, or would do under `--dry-run`. */
export type UninstallStep =
  | { kind: "remove-file"; path: string }
  | { kind: "keep-edited"; path: string }
  | { kind: "remove-shim"; path: string }
  | { kind: "remove-hooks"; settingsPath: string; count: number }
  | { kind: "revert-extra"; id: string }
  | { kind: "purge"; path: string }
  | { kind: "note"; text: string };

/** Every host effect `emet uninstall` needs besides the files under `homeDir` and `stateDir`. */
export interface UninstallEnv {
  homeDir: string;
  stateDir: string;
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

interface InstallLayout {
  installDir: string;
  manifestPath: string;
  shimPath: string;
  settingsPath: string;
}

function layoutFor(homeDir: string): InstallLayout {
  const installDir = path.join(homeDir, ".claude", "emet");
  return {
    installDir,
    manifestPath: path.join(installDir, ".install-manifest.json"),
    shimPath: path.join(homeDir, SHIM_RELATIVE_PATH),
    settingsPath: path.join(homeDir, ".claude", "settings.json"),
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

/** Whether the shim at `shimPath` is the install's wrapper or a symlink into the install directory. */
function shimPointsIntoInstall(
  layout: InstallLayout,
  manifest: ReadonlyMap<string, string>,
): boolean {
  const stat = lstatSync(layout.shimPath);
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(layout.shimPath), readlinkSync(layout.shimPath));
    return isInside(target, layout.installDir);
  }
  if (!stat.isFile()) return false;
  if (manifest.get(SHIM_RELATIVE_PATH) === fileHash(layout.shimPath)) return true;
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

function isGuardHook(hook: unknown): boolean {
  return (
    isObject(hook) && typeof hook.command === "string" && GUARD_COMMAND_PATTERN.test(hook.command)
  );
}

function hookGroups(settings: unknown): unknown[][] {
  if (!isObject(settings) || !isObject(settings.hooks) || Array.isArray(settings.hooks)) return [];
  return Object.values(settings.hooks).filter((groups): groups is unknown[] =>
    Array.isArray(groups),
  );
}

function countGuardHooks(settings: unknown): number {
  let count = 0;
  for (const groups of hookGroups(settings)) {
    for (const group of groups) {
      if (isObject(group) && Array.isArray(group.hooks)) {
        count += group.hooks.filter((hook) => isGuardHook(hook)).length;
      }
    }
  }
  return count;
}

/** `settings` with every `emet guard` hook dropped, and the groups and events that removal empties. */
export function withoutGuardHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const { hooks } = settings;
  if (!isObject(hooks) || Array.isArray(hooks)) return settings;
  const nextHooks: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      nextHooks[event] = groups;
      continue;
    }
    const nextGroups = groups.flatMap((group: unknown) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return [group];
      const remaining = group.hooks.filter((hook) => !isGuardHook(hook));
      if (remaining.length === group.hooks.length) return [group];
      return remaining.length === 0 ? [] : [{ ...group, hooks: remaining }];
    });
    if (nextGroups.length > 0 || groups.length === 0) nextHooks[event] = nextGroups;
  }
  if (Object.keys(nextHooks).length > 0) return { ...settings, hooks: nextHooks };
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "hooks"));
}

function planHooks(settingsPath: string): UninstallStep[] {
  if (!existsSync(settingsPath)) return [];
  const count = countGuardHooks(readJsonFile(settingsPath));
  return count === 0 ? [] : [{ kind: "remove-hooks", settingsPath, count }];
}

/** The ledger's extras to revert; a stub until the Setup ledger lands. */
function planExtras(): UninstallStep[] {
  return [];
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
  const layout = layoutFor(env.homeDir);
  const steps: UninstallStep[] = [];
  const hasManifest = existsSync(layout.manifestPath);
  const manifest = hasManifest ? readManifest(layout.manifestPath) : new Map<string, string>();
  if (hasManifest) {
    steps.push(...planManifestFiles(env.homeDir, manifest));
  } else {
    steps.push({
      kind: "note",
      text: `no install manifest at ${layout.manifestPath} (a plugin install?): run \`${PLUGIN_UNINSTALL_COMMAND}\``,
    });
  }
  steps.push(...planShim(layout, manifest));
  if (hasManifest) steps.push({ kind: "remove-file", path: layout.manifestPath });
  steps.push(...planHooks(layout.settingsPath), ...planExtras());
  if (await env.commandExists("codex")) {
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
    return `remove ${step.count} emet guard hook(s) from ${step.settingsPath}`;
  }
  if (step.kind === "revert-extra") return `revert extra ${step.id}`;
  const verbs: Record<typeof step.kind, string> = {
    "remove-file": "remove",
    "keep-edited": "keep",
    "remove-shim": "remove shim",
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

function removeGuardHooks(settingsPath: string, now: Date): void {
  const settings = readJsonFile(settingsPath);
  if (!isObject(settings) || Array.isArray(settings)) {
    throw new Error(`${settingsPath}: expected a JSON object`);
  }
  copyFileSync(settingsPath, `${settingsPath}.pre-emet-guard-backup.${backupTimestamp(now)}`);
  const temporaryPath = `${settingsPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(withoutGuardHooks(settings), null, 2)}\n`);
  renameSync(temporaryPath, settingsPath);
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

/** Executes one step; throws when it fails. */
export function executeStep(step: UninstallStep, context: StepContext): void {
  switch (step.kind) {
    case "remove-file":
      removeManifestFile(step.path, context);
      return;
    case "remove-shim":
      unlinkSync(step.path);
      return;
    case "remove-hooks":
      removeGuardHooks(step.settingsPath, context.env.now());
      return;
    case "revert-extra":
      throw new Error(`reverting ${step.id} is not supported yet`);
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
function pruneEmptyDirectories(removed: readonly string[], homeDir: string): string[] {
  const failures: string[] = [];
  const protectedDirectories = new Set(
    ["", ".claude", ".claude/commands", ".claude/agents", ".local", ".local/bin"].map((relative) =>
      path.join(homeDir, relative),
    ),
  );
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
  const layout = layoutFor(env.homeDir);
  const context: StepContext = {
    manifestPath: layout.manifestPath,
    hashes: manifestHashes(env.homeDir, layout.manifestPath),
    env,
  };
  const failed: string[] = [];
  const removed: string[] = [];
  for (const step of steps) {
    try {
      executeStep(step, context);
      if (step.kind === "remove-file" || step.kind === "remove-shim") removed.push(step.path);
    } catch (error: unknown) {
      const line = `${describeStep(step)}: ${errorMessage(error)}`;
      failed.push(line);
      env.log(`failed: ${line}`);
    }
  }
  for (const failure of pruneEmptyDirectories(removed, env.homeDir)) {
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
