import { spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import path from "node:path";

import { exitCodes } from "./exit-codes";
import { checkoutTree, installClaudeHost } from "./self-host-claude";
import type { InstallState, SelfDeps } from "./self-install";
import type { HostContext, HostResult } from "./self-types";

/** The options a source install reads; `from` is absent only through a caller bug. */
export interface SourceInstallOptions {
  from?: string;
  dryRun: boolean;
  force?: boolean;
  /** Runs `<bun> install` in `cwd` and resolves to its exit code; defaults to spawning it. */
  runBunInstall?: (bun: string, cwd: string) => Promise<number>;
}

/** Runs `<bun> install --silent` in `cwd`, attached to this terminal, and resolves to its exit code. */
function spawnBunInstall(bun: string, cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bun, ["install", "--silent"], { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

const WRAPPER_CONTENT = '#!/usr/bin/env bash\nexec bun "$HOME/.claude/emet/bin/emet.ts" "$@"\n';
const WRAPPER_MARKER = 'exec bun "$HOME/.claude/emet/bin/emet.ts"';

/** The first `bun` found on `pathEnv`, or undefined. */
function findBun(pathEnv: string): string | undefined {
  for (const directory of pathEnv.split(path.delimiter)) {
    if (directory === "") continue;
    const candidate = path.join(directory, "bun");
    const stat = lstatOrUndefined(candidate);
    if (stat !== undefined && !stat.isDirectory()) return candidate;
  }
  return undefined;
}

function lstatOrUndefined(target: string): Stats | undefined {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    if (error instanceof Error && "code" in error && error.code === "ENOTDIR") return undefined;
    throw error;
  }
}

/** Lists files under `directory` as relative paths, skipping every `node_modules` and the top-level `reference`. */
function listSourceFiles(directory: string, relative = ""): string[] {
  return readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const entryRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.name === "node_modules") return [];
      if (relative === "" && entry.name === "reference") return [];
      if (entry.isDirectory()) return listSourceFiles(directory, entryRelative);
      return entry.isFile() ? [entryRelative] : [];
    })
    .toSorted();
}

function sameBytes(left: string, right: string): boolean {
  const rightStat = lstatOrUndefined(right);
  if (rightStat === undefined || !rightStat.isFile()) return false;
  return readFileSync(left).equals(readFileSync(right));
}

/** Why `~/.local/bin/emet` must not be replaced by the wrapper, or undefined when it may be. */
function wrapperRefusal(shim: string): string | undefined {
  const stat = lstatOrUndefined(shim);
  if (stat === undefined) return undefined;
  const remedy = "Run `emet uninstall` or move it aside, then re-run `emet self install --from`.";
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(shim), readlinkSync(shim));
    return `${shim} is a symlink to ${target}. ${remedy}`;
  }
  if (!stat.isFile()) return `${shim} is not a file. ${remedy}`;
  if (readFileSync(shim, "utf8").includes(WRAPPER_MARKER)) return undefined;
  return `${shim} is a file that emet self install does not manage. ${remedy}`;
}

function writeFileAtomically(target: string, write: (temporary: string) => void): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  write(temporary);
  renameSync(temporary, target);
}

function writeWrapperFile(shim: string): void {
  writeFileAtomically(shim, (temporary) => {
    writeFileSync(temporary, WRAPPER_CONTENT);
    chmodSync(temporary, 0o755);
  });
}

function stateChanged(statePath: string, next: Omit<InstallState, "installedAt">): boolean {
  if (!existsSync(statePath)) return true;
  try {
    const current = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    if (typeof current !== "object" || current === null) return true;
    const version: unknown = Reflect.get(current, "version");
    const binary: unknown = Reflect.get(current, "binary");
    const mode: unknown = Reflect.get(current, "mode");
    const hosts: unknown = Reflect.get(current, "hosts");
    return !(
      version === next.version &&
      binary === next.binary &&
      mode === next.mode &&
      Array.isArray(hosts) &&
      hosts.join(",") === next.hosts.join(",")
    );
  } catch {
    return true;
  }
}

function reportWrites(
  deps: SelfDeps,
  verb: string,
  ownWrites: readonly string[],
  host: HostResult,
): void {
  let total = 0;
  const groups: (readonly [string, readonly string[]])[] = [
    ["emet", ownWrites],
    [host.host, host.writes],
  ];
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

/**
 * Installs emet from the checkout at `options.from` as a Bun source install: the CLI source
 * (without `node_modules` or the reference prompts, which the Claude adapter writes rewritten)
 * is copied to `~/.claude/emet` and its dependencies installed there with `bun install` (which
 * `emet selftest` needs), the Claude adapter installs from the checkout,
 * `~/.local/bin/emet` becomes an `exec bun` wrapper and the install state records
 * `mode: "source"`. Fails with a message and writes nothing when `bun` is missing, the checkout
 * has no `emet/bin/emet.ts`, or `~/.local/bin/emet` is something the wrapper must not replace.
 */
export async function sourceInstall(
  options: SourceInstallOptions,
  deps: SelfDeps,
): Promise<number> {
  const fail = (message: string, code: number): number => {
    deps.error(`emet self install --from: ${message}`);
    return code;
  };
  if (options.from === undefined) return fail("needs a checkout path", exitCodes.usage);
  const bun = findBun(deps.pathEnv);
  if (bun === undefined) {
    return fail(
      "bun was not found on PATH; install bun (https://bun.sh) first. Nothing was written",
      exitCodes.findings,
    );
  }
  const checkout = path.resolve(options.from);
  const sourceRoot = path.join(checkout, "emet");
  if (!existsSync(path.join(sourceRoot, "bin", "emet.ts"))) {
    return fail(
      `${checkout} is not an emet checkout (emet/bin/emet.ts is missing). Nothing was written`,
      exitCodes.usage,
    );
  }
  const shim = path.join(deps.home, ".local", "bin", "emet");
  const shimProblem = wrapperRefusal(shim);
  if (shimProblem !== undefined) return fail(shimProblem, exitCodes.findings);

  const installRoot = path.join(deps.home, ".claude", "emet");
  const statePath = path.join(deps.home, ".local", "share", "emet", "install.json");
  const context = (dryRun: boolean, log: (line: string) => void): HostContext => ({
    home: deps.home,
    emetBin: shim,
    tree: checkoutTree(checkout),
    dryRun,
    force: options.force ?? false,
    now: deps.now,
    log,
  });

  const preview = installClaudeHost(context(true, options.dryRun ? deps.log : () => undefined));
  const changedFiles = listSourceFiles(sourceRoot).filter(
    (relative) => !sameBytes(path.join(sourceRoot, relative), path.join(installRoot, relative)),
  );
  const writeWrapper = !(
    lstatOrUndefined(shim)?.isFile() === true && readFileSync(shim, "utf8") === WRAPPER_CONTENT
  );
  const nextState: Omit<InstallState, "installedAt"> = {
    version: deps.version,
    hosts: preview.status === "skipped" ? [] : [preview.host],
    binary: shim,
    mode: "source",
  };
  const writeState = stateChanged(statePath, nextState);
  const ownWrites = [
    ...changedFiles.map((relative) => path.join(installRoot, relative)),
    ...(writeWrapper ? [shim] : []),
    ...(writeState ? [statePath] : []),
  ];
  if (options.dryRun) {
    reportWrites(deps, "would write", ownWrites, preview);
    deps.log(`would run: bun install in ${installRoot}`);
    return exitCodes.success;
  }

  for (const relative of changedFiles) {
    writeFileAtomically(path.join(installRoot, relative), (temporary) => {
      copyFileSync(path.join(sourceRoot, relative), temporary);
    });
  }
  const bunInstallCode = await (options.runBunInstall ?? spawnBunInstall)(bun, installRoot);
  if (bunInstallCode !== exitCodes.success) {
    return fail(
      `bun install exited ${bunInstallCode} in ${installRoot}; fix it and re-run \`emet self install --from ${checkout}\``,
      exitCodes.findings,
    );
  }
  const applied = installClaudeHost(context(false, deps.log));
  if (writeWrapper) {
    if (lstatOrUndefined(shim)?.isSymbolicLink() === true) rmSync(shim);
    writeWrapperFile(shim);
  }
  if (writeState) {
    const state: InstallState = { ...nextState, installedAt: deps.now().toISOString() };
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  reportWrites(deps, "wrote", ownWrites, applied);
  deps.log("");
  deps.log(`emet ${deps.version} installed from ${checkout}; wrapper at ${shim}`);
  return exitCodes.success;
}
