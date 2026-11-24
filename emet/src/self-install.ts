import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import path from "node:path";

import type { TreeSource } from "./assets";
import { exitCodes } from "./exit-codes";
import { detectEmetPlugin } from "./plugin-detect";
import { installClaudeHost } from "./self-host-claude";
import { installCodexHost } from "./self-host-codex";
import { sourceInstall } from "./self-source";
import type { HostContext, HostResult } from "./self-types";
import { runSelfUpdate } from "./self-update";

/** The host-independent record of a standalone or source install, at `~/.local/share/emet/install.json`. */
export interface InstallState {
  version: string;
  installedAt: string;
  hosts: readonly ("claude" | "codex")[];
  binary: string;
  mode: "standalone" | "source";
}

/** The parsed `emet self install` arguments. */
export interface SelfInstallOptions {
  version?: string;
  dryRun: boolean;
  from?: string;
  force: boolean;
}

/** Everything `emet self` reads from the process and the machine, injected so tests use a temporary home. */
export interface SelfDeps {
  home: string;
  /** The running executable, copied into the versions directory. */
  executablePath: string;
  /** True when running from a compiled binary rather than from source. */
  compiled: boolean;
  /** The running binary's version. */
  version: string;
  tree: () => TreeSource;
  /** True when stdin and stdout are a terminal, so `emet setup` can prompt. */
  interactive: boolean;
  pathEnv: string;
  /** Runs `<emetBin> setup` and resolves to its exit code. */
  runSetup: (emetBin: string) => Promise<number>;
  now: () => Date;
  log: (line: string) => void;
  error: (line: string) => void;
}

const SELF_USAGE = [
  "usage: emet self install [latest|X.Y.Z] [--dry-run] [--force] [--from <checkout>]",
  "       emet self update [latest|X.Y.Z] [--auto]",
].join("\n");

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PLUGIN_ID = "emet@emet-marketplace";

/** The install paths under one home directory. */
interface SelfLayout {
  versionsDir: string;
  binary: string;
  shim: string;
  statePath: string;
}

function stateFilePath(home: string): string {
  return path.join(home, ".local", "share", "emet", "install.json");
}

function layoutFor(home: string, version: string): SelfLayout {
  const versionsDir = path.join(home, ".local", "share", "emet", "versions");
  return {
    versionsDir,
    binary: path.join(versionsDir, version, "emet"),
    shim: path.join(home, ".local", "bin", "emet"),
    statePath: stateFilePath(home),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstallState(value: unknown): value is InstallState {
  if (!isObject(value)) return false;
  const { version, installedAt, hosts, binary, mode } = value;
  return (
    typeof version === "string" &&
    typeof installedAt === "string" &&
    typeof binary === "string" &&
    (mode === "standalone" || mode === "source") &&
    Array.isArray(hosts) &&
    hosts.every((host) => host === "claude" || host === "codex")
  );
}

/**
 * The install state under `home`, or null when the file is absent, is not JSON, or does not have
 * the `InstallState` shape; a reader treats all three as "no standalone install".
 */
export function readInstallState(home: string): InstallState | null {
  const statePath = stateFilePath(home);
  if (!existsSync(statePath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  } catch {
    return null;
  }
  return isInstallState(parsed) ? parsed : null;
}

function lstatOrUndefined(target: string): Stats | undefined {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Why the existing `~/.local/bin/emet` must not be replaced, or undefined when it may be. */
function shimRefusal(layout: SelfLayout): string | undefined {
  const stat = lstatOrUndefined(layout.shim);
  if (stat === undefined) return undefined;
  const remedy =
    "If it is an earlier emet install, run `emet uninstall` first; otherwise move it aside. Then re-run `emet self install`.";
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(layout.shim), readlinkSync(layout.shim));
    if (target.startsWith(`${layout.versionsDir}${path.sep}`)) return undefined;
    const kind = existsSync(target) ? "a symlink" : "a dangling symlink";
    return `${layout.shim} is ${kind} to ${target}, outside ${layout.versionsDir}. ${remedy}`;
  }
  if (stat.isFile()) {
    return `${layout.shim} is a regular file that emet self install does not manage. ${remedy}`;
  }
  return `${layout.shim} is not a file or symlink. Move it aside, then re-run \`emet self install\`.`;
}

function pluginRefusal(home: string): string | undefined {
  const plugin = detectEmetPlugin(home);
  if (!plugin.claude && !plugin.codex) return undefined;
  const lines = ["the emet plugin is installed; a standalone install would duplicate it."];
  lines.push("Remove the plugin first:");
  if (plugin.claude) lines.push(`  claude plugin uninstall ${PLUGIN_ID}`);
  if (plugin.codex) lines.push(`  codex plugin remove ${PLUGIN_ID}`);
  lines.push("or pass --force to install alongside it.");
  return lines.join("\n");
}

/** The version to install, or a refusal with its exit code. */
function resolveVersion(
  requested: string | undefined,
  running: string,
): { version: string } | { code: number; message: string } {
  if (requested === undefined || requested === "latest" || requested === running) {
    return { version: running };
  }
  if (!VERSION_PATTERN.test(requested)) {
    return {
      code: exitCodes.usage,
      message: `"${requested}" is not a version; pass latest or X.Y.Z`,
    };
  }
  return {
    code: exitCodes.findings,
    message: `this binary is emet ${running}; to install ${requested} run \`emet self update ${requested}\``,
  };
}

function sameBytes(left: string, right: string): boolean {
  if (!existsSync(left) || !existsSync(right)) return false;
  if (statSync(left).size !== statSync(right).size) return false;
  return readFileSync(left).equals(readFileSync(right));
}

function shimIsCurrent(layout: SelfLayout): boolean {
  const stat = lstatOrUndefined(layout.shim);
  return stat?.isSymbolicLink() === true && readlinkSync(layout.shim) === layout.binary;
}

function installBinary(source: string, target: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  copyFileSync(source, temporary);
  chmodSync(temporary, 0o755);
  renameSync(temporary, target);
}

function linkShim(binary: string, shim: string): void {
  mkdirSync(path.dirname(shim), { recursive: true });
  const temporary = `${shim}.tmp-${process.pid}`;
  symlinkSync(binary, temporary);
  renameSync(temporary, shim);
}

function renderState(state: InstallState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** The state to write, or undefined when the file already records the same install. */
function plannedState(
  layout: SelfLayout,
  home: string,
  next: Omit<InstallState, "installedAt">,
  now: Date,
): InstallState | undefined {
  const current = readInstallState(home);
  if (
    current !== null &&
    current.version === next.version &&
    current.binary === next.binary &&
    current.mode === next.mode &&
    current.hosts.join(",") === next.hosts.join(",") &&
    existsSync(layout.statePath)
  ) {
    return undefined;
  }
  return { ...next, installedAt: now.toISOString() };
}

function runHosts(context: HostContext): readonly HostResult[] {
  return [installClaudeHost(context), installCodexHost(context)];
}

function reportWrites(
  deps: SelfDeps,
  dryRun: boolean,
  ownWrites: readonly string[],
  hosts: readonly HostResult[],
): void {
  const verb = dryRun ? "would write" : "wrote";
  const groups: (readonly [string, readonly string[]])[] = [
    ["emet", ownWrites],
    ...hosts.map((host) => [host.host, host.writes] as const),
  ];
  let total = 0;
  for (const [name, writes] of groups) {
    if (writes.length === 0) {
      deps.log(`${name}: nothing to write`);
      continue;
    }
    deps.log(`${name}:`);
    for (const write of writes) deps.log(`  ${verb}: ${write}`);
    total += writes.length;
  }
  if (total === 0) deps.log("nothing to write; the install is current");
}

async function finish(deps: SelfDeps, layout: SelfLayout, version: string): Promise<void> {
  if (deps.interactive) {
    const setupCode = await deps.runSetup(layout.shim);
    if (setupCode !== 0) {
      deps.error(`warning: emet setup exited ${setupCode}; re-run \`emet setup\``);
    }
  }
  deps.log("");
  deps.log(`emet ${version} installed at ${layout.binary}`);
  const binDir = path.dirname(layout.shim);
  if (!deps.pathEnv.split(path.delimiter).includes(binDir)) {
    deps.log(`warning: ${binDir} is not on your PATH; add this to your shell profile:`);
    deps.log('  export PATH="$HOME/.local/bin:$PATH"');
  }
  deps.log("Next steps:");
  deps.log("  emet doctor        check the install");
  deps.log("  /emet:init         set up a repo, from Claude Code inside it");
}

/**
 * Installs the running compiled binary as `~/.local/share/emet/versions/<v>/emet`, points
 * `~/.local/bin/emet` at it, runs the host adapters and writes the install state. Refuses, writing
 * nothing, when the emet plugin is installed (unless `force`), when `~/.local/bin/emet` is
 * anything but a symlink into the versions directory, or when running from source without `from`.
 */
export async function selfInstall(options: SelfInstallOptions, deps: SelfDeps): Promise<number> {
  const resolved = resolveVersion(options.version, deps.version);
  if ("code" in resolved) {
    deps.error(`emet self install: ${resolved.message}`);
    return resolved.code;
  }
  if (!options.force) {
    const refusal = pluginRefusal(deps.home);
    if (refusal !== undefined) {
      deps.error(`emet self install: ${refusal}`);
      return exitCodes.findings;
    }
  }
  if (options.from !== undefined) return sourceInstall(options, deps);
  if (!deps.compiled) {
    deps.error(
      "emet self install: running from source; pass --from <checkout> to install from a checkout",
    );
    return exitCodes.usage;
  }
  const layout = layoutFor(deps.home, resolved.version);
  const shimProblem = shimRefusal(layout);
  if (shimProblem !== undefined) {
    deps.error(`emet self install: ${shimProblem}`);
    return exitCodes.findings;
  }

  const copyBinary = !sameBytes(deps.executablePath, layout.binary);
  const repointShim = !shimIsCurrent(layout);
  if (!options.dryRun) {
    runHosts({
      home: deps.home,
      emetBin: layout.shim,
      tree: deps.tree(),
      dryRun: true,
      force: options.force,
      now: deps.now,
      log: () => undefined,
    });
    if (copyBinary) installBinary(deps.executablePath, layout.binary);
    if (repointShim) linkShim(layout.binary, layout.shim);
  }
  const hosts = runHosts({
    home: deps.home,
    emetBin: layout.shim,
    tree: deps.tree(),
    dryRun: options.dryRun,
    force: options.force,
    now: deps.now,
    log: deps.log,
  });
  const state = plannedState(
    layout,
    deps.home,
    {
      version: resolved.version,
      hosts: hosts.filter((host) => host.status !== "skipped").map((host) => host.host),
      binary: layout.binary,
      mode: "standalone",
    },
    deps.now(),
  );
  if (state !== undefined && !options.dryRun) {
    mkdirSync(path.dirname(layout.statePath), { recursive: true });
    writeFileSync(layout.statePath, renderState(state));
  }
  const ownWrites = [
    ...(copyBinary ? [layout.binary] : []),
    ...(repointShim ? [layout.shim] : []),
    ...(state === undefined ? [] : [layout.statePath]),
  ];
  reportWrites(deps, options.dryRun, ownWrites, hosts);
  if (options.dryRun) return exitCodes.success;
  await finish(deps, layout, resolved.version);
  return exitCodes.success;
}

/** Parses `emet self install` arguments, or returns the usage error to print. */
function parseInstallArgs(argv: readonly string[]): SelfInstallOptions | string {
  const options: SelfInstallOptions = { dryRun: false, force: false };
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--dry-run") options.dryRun = true;
    else if (token === "--force") options.force = true;
    else if (token === "--from") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return "--from needs a checkout path";
      options.from = value;
      index += 1;
    } else if (token.startsWith("-")) return `unknown flag ${token}`;
    else positionals.push(token);
  }
  if (positionals.length > 1) return `expected at most one version, got ${positionals.join(" ")}`;
  const [version] = positionals;
  if (version !== undefined) options.version = version;
  return options;
}

/** Runs `emet self <install|update> ...` and resolves to its exit code. */
export async function runSelf(argv: readonly string[], deps: SelfDeps): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "install") {
    const parsed = parseInstallArgs(rest);
    if (typeof parsed === "string") {
      deps.error(`emet self install: ${parsed}`);
      deps.error(SELF_USAGE);
      return exitCodes.usage;
    }
    return selfInstall(parsed, deps);
  }
  if (subcommand === "update") return runSelfUpdate(rest, deps);
  deps.error(SELF_USAGE);
  return exitCodes.usage;
}
