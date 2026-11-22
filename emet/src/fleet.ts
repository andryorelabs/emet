import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentHost } from "./agenthost";
import { readSessionAttention, type SessionAttention } from "./attention";
import {
  checkLaunchReadiness,
  readDiskStats,
  type ReadinessDeps,
  type ReadinessIssue,
} from "./chain";
import { ForgeConfigError, loadForgeConfig, loadForgeConfigWithDefaults } from "./config";
import { exitCodes } from "./exit-codes";
import { defaultRunner, launchSettingsFor, type CommandRunner } from "./launch";
import { BINARY, CONFIG_FILE, resolveConfigPath } from "./names";
import { errorMessage, isObject } from "./narrow";
import { readHostResources, resolveMemReserveBytesFromEnvironment } from "./resources";

/**
 * `emet fleet`: list the repos that carry an emet config under a root, change
 * one config key across all of them, and open a `/emet:run --draft` session in
 * each. Every function takes its filesystem and process effects as deps.
 */

const BYTES_PER_GIB = 1024 ** 3;
const MIN_FREE_BYTES = 2 * BYTES_PER_GIB;
const MIN_FREE_INODES = 10_000;
const FORBIDDEN_KEY_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export interface FleetEntry {
  readonly path: string;
  readonly tracker: string;
  readonly autoChain: boolean;
  readonly workerModel: string;
}

export interface FleetChange {
  readonly path: string;
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly written: boolean;
}

export interface FleetLaunch {
  readonly path: string;
  readonly launched: boolean;
  readonly dryRun: boolean;
  readonly name: string | null;
  readonly reason: string | null;
}

/** A value that the config loader rejects for a key; nothing was written. */
export class FleetValueError extends Error {}

export interface FleetListDeps {
  /** Names of the immediate subdirectories of a directory. */
  readonly listDirectories: (directory: string) => string[];
  readonly isGitRepo: (directory: string) => boolean;
  readonly hasConfig: (directory: string) => boolean;
  readonly loadConfig: (directory: string) => Promise<Awaited<ReturnType<typeof loadForgeConfig>>>;
}

export interface FleetSetDeps {
  /** The raw parsed config of a repo and the file it came from. */
  readonly readRawConfig: (repoPath: string) => Promise<{ file: string; raw: unknown }>;
  readonly writeRawConfig: (file: string, raw: unknown) => Promise<void>;
  /** A reason string when `raw` does not pass the config loader, otherwise null. */
  readonly validate: (raw: unknown) => Promise<string | null>;
}

export interface FleetLaunchDeps {
  readonly runner: CommandRunner;
  readonly loadSettings: (repoPath: string) => Promise<{
    host: AgentHost;
    launcher: ReadinessDeps["launcher"];
    permissionMode: string;
  }>;
  readonly checkReadiness: (
    repoPath: string,
    launcher: ReadinessDeps["launcher"],
  ) => Promise<ReadinessIssue[]>;
}

/** Finds the git repos one level under `root` that have an emet config, sorted by path. */
export async function listFleet(root: string, deps: FleetListDeps): Promise<FleetEntry[]> {
  const candidates = deps
    .listDirectories(root)
    .toSorted()
    .map((name) => path.join(root, name))
    .filter((directory) => deps.isGitRepo(directory) && deps.hasConfig(directory));
  const entries: FleetEntry[] = [];
  for (const directory of candidates) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: keeps output order
    const loaded = await deps.loadConfig(directory);
    if (loaded.status !== "ok") continue;
    const { config } = loaded;
    entries.push({
      path: directory,
      tracker: config.tracker.kind ?? "none",
      autoChain: config.handoff.autoChain,
      workerModel: config.models.worker.model,
    });
  }
  return entries;
}

function splitKey(key: string): string[] {
  const segments = key.split(".");
  if (segments.some((segment) => segment === "" || FORBIDDEN_KEY_SEGMENTS.has(segment))) {
    throw new ForgeConfigError(`${BINARY} fleet set: invalid key ${JSON.stringify(key)}`);
  }
  return segments;
}

function readAtPath(root: unknown, segments: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function withValueAt(raw: unknown, segments: readonly string[], value: unknown): unknown {
  const [head, ...tail] = segments;
  if (head === undefined) return value;
  if (raw !== undefined && !isObject(raw)) {
    throw new FleetValueError(
      `${BINARY} fleet set: ${JSON.stringify(head)} sits under a non-object value`,
    );
  }
  const base: Record<string, unknown> = raw === undefined ? {} : { ...raw };
  base[head] = withValueAt(base[head], tail, value);
  return base;
}

/**
 * Sets one dotted config key in every entry. Every repo is validated through
 * the config loader first; if any rejects the value nothing is written and a
 * {@link FleetValueError} names the repos. A dry run writes nothing.
 */
export async function setFleetKey(
  entries: readonly FleetEntry[],
  key: string,
  value: unknown,
  options: { dryRun: boolean },
  deps: FleetSetDeps,
): Promise<FleetChange[]> {
  const segments = splitKey(key);
  const planned: { entry: FleetEntry; file: string; next: unknown; oldValue: unknown }[] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: keeps output order
    const { file, raw } = await deps.readRawConfig(entry.path);
    const next = withValueAt(raw, segments, value);
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: keeps output order
    const reason = await deps.validate(next);
    if (reason !== null) rejected.push(`${entry.path}: ${reason}`);
    planned.push({ entry, file, next, oldValue: readAtPath(raw, segments) });
  }
  if (rejected.length > 0) {
    throw new FleetValueError(
      `${BINARY} fleet set: ${JSON.stringify(value)} is invalid for ${key}, nothing written\n${rejected.join("\n")}`,
    );
  }
  const changes: FleetChange[] = [];
  for (const { entry, file, next, oldValue } of planned) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: keeps output order
    if (!options.dryRun) await deps.writeRawConfig(file, next);
    changes.push({
      path: entry.path,
      key,
      oldValue: oldValue ?? null,
      newValue: value,
      written: !options.dryRun,
    });
  }
  return changes;
}

async function launchOne(
  entry: FleetEntry,
  feature: string,
  deps: FleetLaunchDeps,
  dryRun: boolean,
): Promise<FleetLaunch> {
  try {
    const settings = await deps.loadSettings(entry.path);
    const issues = await deps.checkReadiness(entry.path, settings.launcher);
    const blocking = issues.filter((issue) => issue.blocking);
    if (blocking.length > 0) {
      const reason = blocking.map((issue) => `${issue.code}: ${issue.detail}`).join("; ");
      return { path: entry.path, launched: false, dryRun: false, name: null, reason };
    }
    const name = `${BINARY}-draft-${path.basename(entry.path)}`;
    if (dryRun) return { path: entry.path, launched: false, dryRun: true, name, reason: null };
    await settings.host.sessions.start(
      {
        name,
        permissionMode: settings.permissionMode,
        prompt: `/${BINARY}:run --draft ${feature}`,
        cwd: entry.path,
      },
      deps.runner,
    );
    return { path: entry.path, launched: true, dryRun: false, name, reason: null };
  } catch (error: unknown) {
    return {
      path: entry.path,
      launched: false,
      dryRun: false,
      name: null,
      reason: errorMessage(error),
    };
  }
}

/**
 * Opens a `/emet:run --draft <feature>` session in each repo after the launch
 * readiness checks of `emet chain`. A repo that fails a blocking check or
 * whose session cannot start is reported, and the others still launch. With
 * `dryRun` the readiness checks still run but no session is started.
 */
export async function launchFleetDraft(
  entries: readonly FleetEntry[],
  feature: string,
  deps: FleetLaunchDeps,
  options: { dryRun: boolean },
): Promise<FleetLaunch[]> {
  const results: FleetLaunch[] = [];
  for (const entry of entries) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: one session start at a time
    results.push(await launchOne(entry, feature, deps, options.dryRun));
  }
  return results;
}

/** Production deps for `list`: real directories, `.git` presence and the config loader. */
export function defaultListDeps(): FleetListDeps {
  return {
    listDirectories: (directory) =>
      readdirSync(directory, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name),
    isGitRepo: (directory) => existsSync(path.join(directory, ".git")),
    hasConfig: (directory) => resolveConfigPath(directory) !== undefined,
    loadConfig: loadForgeConfig,
  };
}

/** Production deps for `set`: validates by loading the candidate through a scratch config file. */
export function defaultSetDeps(): FleetSetDeps {
  return {
    readRawConfig: async (repoPath) => {
      const file = resolveConfigPath(repoPath)?.path ?? path.join(repoPath, CONFIG_FILE);
      const raw: unknown = await Bun.file(file).json();
      return { file, raw };
    },
    writeRawConfig: async (file, raw) => {
      await Bun.write(file, `${JSON.stringify(raw, null, 2)}\n`);
    },
    validate: async (raw) => {
      const scratch = mkdtempSync(path.join(os.tmpdir(), "emet-fleet-"));
      try {
        await Bun.write(path.join(scratch, CONFIG_FILE), JSON.stringify(raw));
        const loaded = await loadForgeConfig(scratch);
        return loaded.status === "malformed" ? loaded.reason : null;
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
  };
}

/** Production deps for `launch`: per-repo host settings and the `emet chain` readiness checks. */
export function defaultLaunchDeps(runner: CommandRunner = defaultRunner): FleetLaunchDeps {
  return {
    runner,
    loadSettings: async (repoPath) => {
      const { config } = await loadForgeConfigWithDefaults(repoPath);
      return launchSettingsFor(config);
    },
    checkReadiness: (repoPath, launcher) =>
      checkLaunchReadiness({
        runner,
        launcher,
        repoRoot: repoPath,
        tmpDir: os.tmpdir(),
        readResources: readHostResources,
        memReserveBytes: resolveMemReserveBytesFromEnvironment(),
        readDiskStats,
        minFreeBytes: MIN_FREE_BYTES,
        minFreeInodes: MIN_FREE_INODES,
      }),
  };
}

const USAGE = `usage: ${BINARY} fleet <list | set <key> <value> | launch --feature <text> | status> [--root <dir>] [--repos <a,b>] [--dry-run] [--json]`;
const VALUE_FLAGS: ReadonlySet<string> = new Set(["--root", "--repos", "--feature"]);

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function positionals(argv: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (VALUE_FLAGS.has(token)) index += 1;
    else if (!token.startsWith("--")) result.push(token);
  }
  return result;
}

function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatEntry(entry: FleetEntry): string {
  return `${entry.path}\ttracker=${entry.tracker}\tautoChain=${entry.autoChain}\tworker=${entry.workerModel}`;
}

function formatChange(change: FleetChange): string {
  const suffix = change.written ? "" : " (dry run)";
  return `${change.path}\t${change.key}: ${JSON.stringify(change.oldValue)} -> ${JSON.stringify(change.newValue)}${suffix}`;
}

function formatLaunch(launch: FleetLaunch): string {
  if (launch.dryRun) return `${launch.path}\twould launch ${launch.name}`;
  return launch.launched
    ? `${launch.path}\tlaunched ${launch.name}`
    : `${launch.path}\tnot launched: ${launch.reason}`;
}

function print<Row>(json: boolean, rows: readonly Row[], format: (row: Row) => string): void {
  console.log(json ? JSON.stringify(rows) : rows.map((row) => format(row)).join("\n"));
}

function selectRepos(entries: FleetEntry[], repos: string | undefined): FleetEntry[] {
  if (repos === undefined) return entries;
  const wanted = new Set(repos.split(",").filter((name) => name !== ""));
  return entries.filter((entry) => wanted.has(path.basename(entry.path)));
}

/** Sessions grouped per repo, with the count of sessions that wait on a decision. */
export interface FleetStatus {
  repos: { repo: string; sessions: SessionAttention[] }[];
  blocked: number;
}

function countBlocked(group: SessionAttention[]): number {
  return group.filter((session) => session.blocked).length;
}

/** Groups sessions per repo, repos with blocked sessions first, then by name. */
export function buildFleetStatus(sessions: SessionAttention[]): FleetStatus {
  const byRepo = new Map<string, SessionAttention[]>();
  for (const session of sessions) {
    const group = byRepo.get(session.repo) ?? [];
    group.push(session);
    byRepo.set(session.repo, group);
  }
  const repos = [...byRepo.entries()]
    .map(([repo, group]) => ({ repo, sessions: group }))
    .toSorted(
      (left, right) =>
        Number(countBlocked(right.sessions) > 0) - Number(countBlocked(left.sessions) > 0) ||
        left.repo.localeCompare(right.repo),
    );
  return { repos, blocked: countBlocked(sessions) };
}

function formatStatusLine(entry: FleetStatus["repos"][number]): string {
  const count = (state: SessionAttention["state"]): number =>
    entry.sessions.filter((session) => session.state === state).length;
  return `${entry.repo}: ${count("needs-decision")} blocked, ${count("working")} working, ${count("idle")} idle`;
}

export interface FleetRunDeps {
  readonly status?: () => SessionAttention[];
  readonly list?: FleetListDeps;
  readonly set?: FleetSetDeps;
  readonly launch?: FleetLaunchDeps;
}

/** Entry point for `emet fleet`: usage errors exit 2, a rejected value or failed launch exits 1. */
export async function run(argv: string[], overrides: FleetRunDeps = {}): Promise<void> {
  try {
    const [subcommand, ...rest] = positionals(argv);
    if (
      subcommand !== "list" &&
      subcommand !== "set" &&
      subcommand !== "launch" &&
      subcommand !== "status"
    ) {
      throw new ForgeConfigError(USAGE);
    }
    if (subcommand === "status") {
      const status = buildFleetStatus((overrides.status ?? (() => readSessionAttention({})))());
      console.log(
        argv.includes("--json")
          ? JSON.stringify(status)
          : status.repos.map((entry) => formatStatusLine(entry)).join("\n"),
      );
      return;
    }
    const root = readFlagValue(argv, "--root") ?? path.join(os.homedir(), "code");
    const json = argv.includes("--json");
    const entries = await listFleet(root, overrides.list ?? defaultListDeps());
    if (subcommand === "list") {
      print(json, entries, formatEntry);
    } else if (subcommand === "set") {
      const [key, valueText] = rest;
      if (key === undefined || valueText === undefined) throw new ForgeConfigError(USAGE);
      const changes = await setFleetKey(
        entries,
        key,
        parseValue(valueText),
        { dryRun: argv.includes("--dry-run") },
        overrides.set ?? defaultSetDeps(),
      );
      print(json, changes, formatChange);
    } else {
      const feature = readFlagValue(argv, "--feature");
      if (feature === undefined || feature === "") throw new ForgeConfigError(USAGE);
      const launches = await launchFleetDraft(
        selectRepos(entries, readFlagValue(argv, "--repos")),
        feature,
        overrides.launch ?? defaultLaunchDeps(),
        { dryRun: argv.includes("--dry-run") },
      );
      print(json, launches, formatLaunch);
      if (launches.some((launch) => !launch.launched && !launch.dryRun))
        process.exitCode = exitCodes.findings;
    }
  } catch (error: unknown) {
    console.error(errorMessage(error));
    if (error instanceof FleetValueError) process.exitCode = exitCodes.findings;
    else if (error instanceof ForgeConfigError) process.exitCode = exitCodes.usage;
    else process.exitCode = exitCodes.internal;
  }
}
