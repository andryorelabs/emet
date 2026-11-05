/**
 * `emet land --spec <s> --branch <integration> --tickets <id,...>` — the
 * `landing.mode: merge` counterpart of opening and merging a PR.
 *
 * Merges the integration branch into local trunk in the main worktree per
 * `pr.mergeMethod`, never pushes, and prints `{ "trunk": "<sha>", "tickets": [...] }`.
 * Every refusal exits 1 with a reason and leaves trunk, the index and the
 * working tree exactly as they were.
 */

import { realpath } from "node:fs/promises";
import path from "node:path";

import { loadForgeConfigWithDefaults, type ForgeConfig } from "./config";
import { errorMessage } from "./narrow";
import { writePhase } from "./phase";

type MergeMethod = ForgeConfig["pr"]["mergeMethod"];

const USAGE = `usage: emet land --spec <s> --branch <integration> --tickets <id,...> [--summary <text>] [--type <type>] [--wave <n>]

Merges <integration> into local trunk (landing.mode "merge"), per pr.mergeMethod:
  squash  one commit "<type>: <summary> (wave <n> of <spec>)" whose body lists each ticket
  merge   a --no-ff merge commit with the same message
  rebase  a fast-forward; refused unless the branch already sits on trunk
Never pushes. Prints {"trunk": "<sha>", "tickets": [...]}. Exit 1 on refusal.`;

const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const EXIT_INTERNAL = 3;
const DEFAULT_COMMIT_TYPE = "feat";

class LandUsageError extends Error {}
class LandRefusedError extends Error {}

export type LandOptions = {
  readonly cwd: string;
  readonly spec: string;
  readonly branch: string;
  readonly tickets: readonly string[];
  readonly summary?: string;
  readonly type?: string;
  readonly wave?: number;
};

export type LandResult = {
  readonly trunk: string;
  readonly tickets: readonly string[];
};

type GitResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };

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
    throw new LandRefusedError(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function resolveMainWorktree(cwd: string): Promise<string> {
  const common = await git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (common.exitCode !== 0) throw new LandRefusedError("not inside a git repository");
  return path.dirname(await realpath(common.stdout));
}

function formatCommitMessage(options: LandOptions): { subject: string; body: string } {
  const scope =
    options.wave === undefined ? options.spec : `wave ${options.wave} of ${options.spec}`;
  const summary = options.summary ?? `land ${options.branch}`;
  return {
    subject: `${options.type ?? DEFAULT_COMMIT_TYPE}: ${summary} (${scope})`,
    body: options.tickets.map((ticket) => `- ${ticket}`).join("\n"),
  };
}

async function requireLandableState(
  mainTree: string,
  trunk: string,
  branch: string,
): Promise<string> {
  const head = await git(mainTree, "symbolic-ref", "--short", "-q", "HEAD");
  if (head.exitCode !== 0) {
    throw new LandRefusedError(`main worktree is on a detached HEAD, not ${trunk}`);
  }
  if (head.stdout !== trunk) {
    throw new LandRefusedError(`main worktree is on ${head.stdout}, not ${trunk}`);
  }
  const status = await requireGit(mainTree, "status", "--porcelain", "--untracked-files=no");
  if (status.length > 0) throw new LandRefusedError("main worktree is not clean");
  const branchCheck = await git(
    mainTree,
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  );
  if (branchCheck.exitCode !== 0) {
    throw new LandRefusedError(`integration branch ${branch} does not exist`);
  }
  const ancestor = await git(mainTree, "merge-base", "--is-ancestor", branch, trunk);
  if (ancestor.exitCode === 0) {
    throw new LandRefusedError(`${branch} is already merged into ${trunk}`);
  }
  const trial = await git(mainTree, "merge-tree", "--write-tree", trunk, branch);
  if (trial.exitCode !== 0) {
    throw new LandRefusedError(`merge conflict between ${branch} and ${trunk}`);
  }
  return requireGit(mainTree, "rev-parse", trunk);
}

async function applyMerge(
  mainTree: string,
  method: MergeMethod,
  branch: string,
  message: { subject: string; body: string },
): Promise<void> {
  if (method === "rebase") {
    const result = await git(mainTree, "merge", "--ff-only", branch);
    if (result.exitCode !== 0) {
      throw new LandRefusedError(
        `${branch} is not a fast-forward of trunk; rebase it onto trunk first`,
      );
    }
    return;
  }
  if (method === "merge") {
    await requireGit(
      mainTree,
      "merge",
      "--no-ff",
      "-m",
      message.subject,
      "-m",
      message.body,
      branch,
    );
    return;
  }
  await requireGit(mainTree, "merge", "--squash", branch);
  const staged = await git(mainTree, "diff", "--cached", "--quiet");
  if (staged.exitCode === 0) {
    throw new LandRefusedError(`${branch} adds no changes to trunk`);
  }
  await requireGit(mainTree, "commit", "-m", message.subject, "-m", message.body);
}

async function restoreTrunk(mainTree: string, originalSha: string): Promise<void> {
  await git(mainTree, "merge", "--abort");
  await git(mainTree, "reset", "--merge", originalSha);
}

export async function land(options: LandOptions): Promise<LandResult> {
  const mainTree = await resolveMainWorktree(options.cwd);
  const { config } = await loadForgeConfigWithDefaults(mainTree);
  if (config.landing.mode !== "merge") {
    throw new LandRefusedError('landing.mode is not "merge"; open a PR instead');
  }
  if (!config.pr.autoMerge) {
    throw new LandRefusedError(`pr.autoMerge is off; ${options.branch} is left unmerged`);
  }
  const trunk = config.repo.trunk;
  const originalSha = await requireLandableState(mainTree, trunk, options.branch);
  try {
    await applyMerge(mainTree, config.pr.mergeMethod, options.branch, formatCommitMessage(options));
  } catch (error) {
    await restoreTrunk(mainTree, originalSha);
    throw error;
  }
  return { trunk: await requireGit(mainTree, "rev-parse", trunk), tickets: options.tickets };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new LandUsageError(`${flag} requires a value\n\n${USAGE}`);
  }
  return value;
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined) throw new LandUsageError(`missing ${flag}\n\n${USAGE}`);
  return value;
}

export function parseLandArguments(argv: readonly string[]): Omit<LandOptions, "cwd"> {
  const tickets = requireFlag(argv, "--tickets")
    .split(",")
    .map((ticket) => ticket.trim())
    .filter((ticket) => ticket.length > 0);
  if (tickets.length === 0) throw new LandUsageError(`--tickets lists no ticket\n\n${USAGE}`);
  const waveText = flagValue(argv, "--wave");
  if (waveText !== undefined && !/^\d+$/.test(waveText)) {
    throw new LandUsageError(`--wave must be a number\n\n${USAGE}`);
  }
  const summary = flagValue(argv, "--summary");
  const type = flagValue(argv, "--type");
  return {
    spec: requireFlag(argv, "--spec"),
    branch: requireFlag(argv, "--branch"),
    tickets,
    ...(summary === undefined ? {} : { summary }),
    ...(type === undefined ? {} : { type }),
    ...(waveText === undefined ? {} : { wave: Number(waveText) }),
  };
}

export async function run(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  try {
    const result = await land({ ...parseLandArguments(argv), cwd: process.cwd() });
    writePhase(await resolveMainWorktree(process.cwd()), {
      phase: "landing",
      wave: null,
      spec: null,
      runId: null,
    });
    console.log(JSON.stringify(result));
  } catch (error: unknown) {
    if (error instanceof LandUsageError) {
      console.error(error.message);
      process.exitCode = EXIT_USAGE;
    } else if (error instanceof LandRefusedError) {
      console.error(`emet land: ${error.message}`);
      process.exitCode = EXIT_REFUSED;
    } else {
      console.error(`emet land: ${errorMessage(error)}`);
      process.exitCode = EXIT_INTERNAL;
    }
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
