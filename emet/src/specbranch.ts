/**
 * `emet spec-branch ensure|integrate|status|sync|land|abandon`: the spec
 * branch `spec/<id>` that collects every integrated wave of one spec.
 *
 * `ensure` creates it from trunk, `integrate` merges a wave branch into it
 * with `Emet-Wave` and `Emet-Tickets` trailers, and `status` reads it back,
 * rebuilding `.emet/specs/<id>/branch.json` from those trailers when a crash
 * left the file behind the git history. History is never rebased.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";

import { loadForgeConfigWithDefaults, type ForgeConfig } from "./config";
import { exitCodes } from "./exit-codes";
import { appendEvent } from "./journal";
import { RUN_DIR } from "./names";
import { errorMessage, isObject } from "./narrow";
import { trunkReference } from "./worktrees";

/** One integrated wave recorded in `branch.json`. */
export interface IntegratedWave {
  wave: number;
  tickets: string[];
  sha: string;
}

/** The `.emet/specs/<id>/branch.json` document, with `tip` read live from git. */
export interface SpecBranchState {
  spec: string;
  branch: string;
  tip: string;
  waves: IntegratedWave[];
}

/** What every subcommand receives after the dispatcher resolved the repo. */
export interface SpecBranchContext {
  root: string;
  spec: string;
  config: ForgeConfig;
  trunk: string;
}

const USAGE = `usage: emet spec-branch <ensure|integrate|status|sync|land|abandon> --spec <id> [...]

  ensure     --spec <id>                                  create spec/<id> from trunk
  integrate  --spec <id> --wave <n> [--branch <ref>] --tickets a,b
                                                          merge the wave branch into spec/<id>
  status     --spec <id>                                  print the branch, tip, waves and behindTrunk as JSON
  sync       --spec <id>                                  merge trunk into spec/<id>
  land       --spec <id> [--partial]                      land spec/<id> on trunk
  abandon    --spec <id> --force                          tag and delete spec/<id>`;

class SpecBranchUsageError extends Error {}

class SpecBranchRefusedError extends Error {}

interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function git(cwd: string, ...args: string[]): Promise<GitResult> {
  const result = await Bun.$`git -C ${cwd} ${args}`.nothrow().quiet();
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

async function requireGit(cwd: string, ...args: string[]): Promise<string> {
  const result = await git(cwd, ...args);
  if (result.exitCode !== 0) {
    throw new SpecBranchRefusedError(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/** The branch name of a spec: `spec/<id>`. */
export function specBranchName(spec: string): string {
  return `spec/${spec}`;
}

/** The wave branch name of a spec: `spec/<id>-w<n>`. */
export function waveBranchName(spec: string, wave: number): string {
  return `spec/${spec}-w${wave}`;
}

function branchFilePath(root: string, spec: string): string {
  return path.join(root, RUN_DIR, "specs", spec, "branch.json");
}

function parseWaves(value: unknown): IntegratedWave[] {
  if (!Array.isArray(value)) return [];
  const waves: IntegratedWave[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const { wave, tickets, sha } = entry;
    if (typeof wave !== "number" || typeof sha !== "string" || !Array.isArray(tickets)) continue;
    waves.push({
      wave,
      sha,
      tickets: tickets.filter((ticket): ticket is string => typeof ticket === "string"),
    });
  }
  return waves;
}

function readRecordedWaves(root: string, spec: string): IntegratedWave[] | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(branchFilePath(root, spec), "utf8"));
    return isObject(parsed) ? parseWaves(parsed.waves) : [];
  } catch {
    return null;
  }
}

function writeBranchFile(root: string, state: SpecBranchState): void {
  const file = branchFilePath(root, state.spec);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}

async function branchExists(root: string, branch: string): Promise<boolean> {
  const result = await git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
  return result.exitCode === 0;
}

const TRAILER_FORMAT =
  "%H%x1f%(trailers:key=Emet-Wave,valueonly,separator=%x2c)%x1f%(trailers:key=Emet-Tickets,valueonly,separator=%x2c)%x1e";

async function wavesFromTrailers(
  root: string,
  trunk: string,
  branch: string,
): Promise<IntegratedWave[]> {
  const log = await git(
    root,
    "log",
    "--first-parent",
    "--reverse",
    `--format=${TRAILER_FORMAT}`,
    `${trunk}..${branch}`,
  );
  if (log.exitCode !== 0) return [];
  const waves: IntegratedWave[] = [];
  for (const record of log.stdout.split("\x1e")) {
    const [sha, waveText, ticketText] = record.trim().split("\x1f");
    if (sha === undefined || waveText === undefined || !/^\d+$/.test(waveText.trim())) continue;
    const tickets = (ticketText ?? "")
      .split(",")
      .map((ticket) => ticket.trim())
      .filter((ticket) => ticket.length > 0);
    waves.push({ wave: Number(waveText.trim()), tickets, sha });
  }
  return waves;
}

function sameWaves(left: readonly IntegratedWave[], right: readonly IntegratedWave[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Reads `branch.json` and reconciles it with the `Emet-Wave` trailers in git,
 * rewriting the file when a wave is missing. Returns `null` when the branch
 * does not exist.
 */
export async function readSpecBranchState(
  root: string,
  spec: string,
): Promise<SpecBranchState | null> {
  const branch = specBranchName(spec);
  if (!(await branchExists(root, branch))) return null;
  const recorded = readRecordedWaves(root, spec);
  const { config } = await loadForgeConfigWithDefaults(root);
  const waves = await wavesFromTrailers(root, await resolveTrunk(root, config), branch);
  const state: SpecBranchState = {
    spec,
    branch,
    tip: await requireGit(root, "rev-parse", branch),
    waves,
  };
  if (recorded === null || !sameWaves(recorded, waves)) writeBranchFile(root, state);
  return state;
}

/** The trunk ref a spec branch forks from: `<remote>/<trunk>` in `pr` mode, local trunk in `merge` mode. */
export function specTrunkReference(config: ForgeConfig): string {
  return trunkReference(config.repo.remote, config.repo.trunk, config.landing.mode === "merge");
}

async function resolveTrunk(root: string, config: ForgeConfig): Promise<string> {
  const reference = specTrunkReference(config);
  const found = await git(root, "rev-parse", "--verify", "--quiet", `${reference}^{commit}`);
  return found.exitCode === 0 ? reference : config.repo.trunk;
}

async function checkedOutBranches(root: string): Promise<Map<string, string>> {
  const listing = await git(root, "worktree", "list", "--porcelain");
  const branches = new Map<string, string>();
  if (listing.exitCode !== 0) return branches;
  let directory = "";
  for (const line of listing.stdout.split("\n")) {
    if (line.startsWith("worktree ")) directory = line.slice("worktree ".length);
    else if (line.startsWith("branch refs/heads/")) {
      branches.set(line.slice("branch refs/heads/".length), directory);
    }
  }
  return branches;
}

async function refuseForeignCheckout(root: string, spec: string): Promise<void> {
  for (const [checkedOut, directory] of await checkedOutBranches(root)) {
    const other = /^spec\/(.+?)(?:-w\d+)?$/.exec(checkedOut)?.[1];
    if (other !== undefined && other !== spec) {
      throw new SpecBranchRefusedError(
        `spec ${other} is checked out in ${directory} (${checkedOut}); finish or abandon it before ensuring spec ${spec}`,
      );
    }
  }
}

async function ensure(context: SpecBranchContext): Promise<number> {
  const { root, spec, trunk } = context;
  await refuseForeignCheckout(root, spec);
  const branch = specBranchName(spec);
  const trunkCheck = await git(root, "rev-parse", "--verify", "--quiet", `${trunk}^{commit}`);
  if (trunkCheck.exitCode !== 0) {
    throw new SpecBranchRefusedError(`trunk ${trunk} does not exist`);
  }
  if (!(await branchExists(root, branch))) await requireGit(root, "branch", branch, trunk);
  const state = await readSpecBranchState(root, spec);
  if (state === null) throw new SpecBranchRefusedError(`could not create ${branch}`);
  writeBranchFile(root, state);
  console.log(JSON.stringify(state));
  return exitCodes.success;
}

interface IntegrateOptions {
  wave: number;
  branch: string;
  tickets: string[];
}

async function advanceSpecBranch(
  root: string,
  branch: string,
  tip: string,
  merged: string,
  message: string[],
): Promise<string> {
  const holder = (await checkedOutBranches(root)).get(branch);
  if (holder !== undefined && path.resolve(holder) !== path.resolve(root)) {
    throw new SpecBranchRefusedError(
      `${branch} is checked out in ${holder}; run integrate from that checkout's main worktree or switch it away first`,
    );
  }
  const checkedOut = holder !== undefined;
  if (checkedOut) {
    const dirty = await requireGit(root, "status", "--porcelain", "--untracked-files=no");
    if (dirty.length > 0) {
      throw new SpecBranchRefusedError(`${branch} is checked out and not clean`);
    }
  }
  const tree = await git(root, "merge-tree", "--write-tree", tip, merged);
  if (tree.exitCode !== 0) {
    throw new SpecBranchRefusedError(`merge conflict between ${merged} and ${branch}`);
  }
  const treeSha = tree.stdout.split("\n")[0] ?? "";
  const messageArguments = message.flatMap((part) => ["-m", part]);
  const commit = await requireGit(
    root,
    "commit-tree",
    treeSha,
    "-p",
    tip,
    "-p",
    merged,
    ...messageArguments,
  );
  await requireGit(root, "update-ref", `refs/heads/${branch}`, commit, tip);
  if (checkedOut) await requireGit(root, "reset", "--hard", "-q", commit);
  return commit;
}

async function pushSpecBranch(context: SpecBranchContext, branch: string): Promise<void> {
  if (!context.config.landing.pushSpecBranch) return;
  const remoteName = context.config.repo.remote;
  const remote = await git(context.root, "remote", "get-url", remoteName);
  if (remote.exitCode !== 0) {
    console.error(`emet spec-branch: no ${remoteName} remote; spec branch not pushed`);
    return;
  }
  const pushed = await git(context.root, "push", remoteName, `${branch}:${branch}`);
  if (pushed.exitCode !== 0) {
    throw new SpecBranchRefusedError(`pushing ${branch} failed: ${pushed.stderr}`);
  }
}

async function integrate(context: SpecBranchContext, options: IntegrateOptions): Promise<number> {
  const { root, spec } = context;
  const branch = specBranchName(spec);
  const state = await readSpecBranchState(root, spec);
  if (state === null) {
    throw new SpecBranchRefusedError(`${branch} does not exist; run \`emet spec-branch ensure\``);
  }
  if (state.waves.some((entry) => entry.wave === options.wave)) {
    await pushSpecBranch(context, branch);
    console.log(JSON.stringify(state));
    return exitCodes.success;
  }
  if (!(await branchExists(root, options.branch))) {
    throw new SpecBranchRefusedError(`wave branch ${options.branch} does not exist`);
  }
  const ancestor = await git(root, "merge-base", "--is-ancestor", options.branch, branch);
  if (ancestor.exitCode === 0) {
    throw new SpecBranchRefusedError(`${options.branch} is already merged into ${branch}`);
  }
  const commit = await advanceSpecBranch(root, branch, state.tip, options.branch, [
    `chore: 🔀 integrate wave ${options.wave} of ${spec}`,
    `Emet-Wave: ${options.wave}\nEmet-Tickets: ${options.tickets.join(",")}`,
  ]);
  const next: SpecBranchState = {
    spec,
    branch,
    tip: commit,
    waves: [...state.waves, { wave: options.wave, tickets: options.tickets, sha: commit }],
  };
  writeBranchFile(root, next);
  appendEvent({
    kind: "spec.integrate",
    repo: root,
    origin: "auto",
    data: { spec, wave: options.wave, tickets: options.tickets, tip: commit },
  });
  await pushSpecBranch(context, branch);
  console.log(JSON.stringify(next));
  return exitCodes.success;
}

async function status(context: SpecBranchContext): Promise<number> {
  const { root, spec, trunk } = context;
  const state = await readSpecBranchState(root, spec);
  if (state === null) {
    throw new SpecBranchRefusedError(`${specBranchName(spec)} does not exist`);
  }
  const behind = await requireGit(root, "rev-list", "--count", `${state.branch}..${trunk}`);
  console.log(JSON.stringify({ ...state, behindTrunk: Number(behind) }));
  return exitCodes.success;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new SpecBranchUsageError(`${flag} requires a value\n\n${USAGE}`);
  }
  return value;
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined) throw new SpecBranchUsageError(`missing ${flag}\n\n${USAGE}`);
  return value;
}

function parseIntegrateOptions(argv: readonly string[], spec: string): IntegrateOptions {
  const waveText = requireFlag(argv, "--wave");
  if (!/^\d+$/.test(waveText)) {
    throw new SpecBranchUsageError(`--wave must be a number\n\n${USAGE}`);
  }
  const wave = Number(waveText);
  const tickets = requireFlag(argv, "--tickets")
    .split(",")
    .map((ticket) => ticket.trim())
    .filter((ticket) => ticket.length > 0);
  if (tickets.length === 0) {
    throw new SpecBranchUsageError(`--tickets lists no ticket\n\n${USAGE}`);
  }
  return { wave, tickets, branch: flagValue(argv, "--branch") ?? waveBranchName(spec, wave) };
}

async function resolveMainWorktree(cwd: string): Promise<string> {
  const common = await git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (common.exitCode !== 0) throw new SpecBranchRefusedError("not inside a git repository");
  return path.dirname(await realpath(common.stdout));
}

async function dispatch(subcommand: string, argv: string[]): Promise<number> {
  const spec = requireFlag(argv, "--spec");
  const root = await resolveMainWorktree(process.cwd());
  const { config } = await loadForgeConfigWithDefaults(root);
  const context: SpecBranchContext = {
    root,
    spec,
    config,
    trunk: await resolveTrunk(root, config),
  };
  switch (subcommand) {
    case "ensure":
      return ensure(context);
    case "integrate":
      return integrate(context, parseIntegrateOptions(argv, spec));
    case "status":
      return status(context);
    case "sync":
      return (await import("./speclanding")).runSync(argv, context);
    case "land":
      return (await import("./speclanding")).runLand(argv, context);
    case "abandon":
      return (await import("./specabandon")).runAbandon(argv, context);
  }
  throw new SpecBranchUsageError(`unknown subcommand ${subcommand}\n\n${USAGE}`);
}

/** Runs `emet spec-branch`; returns the process exit code. */
export async function run(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    console.log(USAGE);
    return subcommand === undefined ? exitCodes.usage : exitCodes.success;
  }
  try {
    return await dispatch(subcommand, rest);
  } catch (error: unknown) {
    if (error instanceof SpecBranchUsageError) {
      console.error(error.message);
      return exitCodes.usage;
    }
    if (error instanceof SpecBranchRefusedError) {
      console.error(`emet spec-branch: ${error.message}`);
      return exitCodes.findings;
    }
    console.error(`emet spec-branch: ${errorMessage(error)}`);
    return exitCodes.internal;
  }
}
