/**
 * `forge verify <ticket> [--run <id>] [--worktree <path>]` — the enforcement
 * check the coordinator runs after each worker, before review/merge. It
 * passes only when, against the baseline recorded at dispatch:
 *
 *   1. commits exist beyond the baseline (forge bookkeeping files excluded),
 *   2. every changed path is inside the ticket's edit surfaces,
 *   3. the ticket's handoff note passes `forge handoff --check`,
 *   4. `commands.workerScopedSuite` (when configured) passes, run by forge.
 *
 * Dispatch record (written by the coordinator at dispatch):
 *   `.forge/runs/<run>/dispatch/<ticket>.json` = { baseline, surfaces[] }
 * The pass/fail record lands at `.forge/runs/<run>/verify/<ticket>.json`
 * (in the repo root, not the worker worktree). Exit 1 on fail, 2 on usage or
 * missing-input errors.
 */

import { isCompiledBinary } from "./assets";
import { optionalProperty } from "./optional";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveRepoRoot } from "./config";
import { globsOverlap } from "./surfaces";
import { isObject } from "./narrow";

const USAGE = `usage: forge verify <ticket> [--run <id>] [--worktree <path>]`;

const BOOKKEEPING_PREFIX = ".forge/";

export type DispatchRecord = {
  readonly baseline: string;
  readonly surfaces: readonly string[];
};

type CheckResult = {
  readonly name: "commits" | "surfaces" | "handoff" | "suite";
  readonly ok: boolean;
  readonly detail: string;
};

export type VerifyRecord = {
  readonly ticket: string;
  readonly ok: boolean;
  readonly baseline: string;
  readonly head: string;
  readonly checks: readonly CheckResult[];
  readonly at: string;
};

type CommandOutcome = { readonly exitCode: number; readonly output: string };

export type VerifyDependencies = {
  readonly head: () => Promise<string>;
  readonly commitCount: (baseline: string) => Promise<number>;
  readonly changedPaths: (baseline: string) => Promise<string[]>;
  readonly handoffCheck: () => Promise<CommandOutcome>;
  readonly workerScopedSuite: string | undefined;
  readonly runSuite: (command: string) => Promise<CommandOutcome>;
};

export function isBookkeepingPath(changedPath: string): boolean {
  return changedPath.startsWith(BOOKKEEPING_PREFIX);
}

export function findOutOfSurfacePaths(
  changedPaths: readonly string[],
  surfaces: readonly string[],
): string[] {
  return changedPaths.filter((changed) => !surfaces.some((glob) => globsOverlap(changed, glob)));
}

function tail(text: string, maxLines = 15): string {
  return text.trimEnd().split("\n").slice(-maxLines).join("\n");
}

export async function verifyTicket(
  ticket: string,
  dispatch: DispatchRecord,
  deps: VerifyDependencies,
  now: () => Date = () => new Date(),
): Promise<VerifyRecord> {
  const checks: CheckResult[] = [];
  const head = await deps.head();

  const commitCount = await deps.commitCount(dispatch.baseline);
  const changed = (await deps.changedPaths(dispatch.baseline)).filter(
    (changedPath) => !isBookkeepingPath(changedPath),
  );
  const hasWork = commitCount > 0 && changed.length > 0;
  checks.push({
    name: "commits",
    ok: hasWork,
    detail: hasWork
      ? `${commitCount} commit(s) beyond ${dispatch.baseline.slice(0, 9)}`
      : `no non-bookkeeping commits beyond baseline ${dispatch.baseline.slice(0, 9)}`,
  });

  const outside = findOutOfSurfacePaths(changed, dispatch.surfaces);
  checks.push({
    name: "surfaces",
    ok: outside.length === 0,
    detail:
      outside.length === 0
        ? `${changed.length} path(s) inside surfaces`
        : `outside surfaces: ${outside.join(", ")}`,
  });

  const handoff = await deps.handoffCheck();
  checks.push({
    name: "handoff",
    ok: handoff.exitCode === 0,
    detail: handoff.exitCode === 0 ? "handoff --check passed" : tail(handoff.output),
  });

  if (deps.workerScopedSuite) {
    const suite = await deps.runSuite(deps.workerScopedSuite);
    checks.push({
      name: "suite",
      ok: suite.exitCode === 0,
      detail:
        suite.exitCode === 0
          ? `\`${deps.workerScopedSuite}\` passed`
          : `\`${deps.workerScopedSuite}\` exited ${suite.exitCode}\n${tail(suite.output)}`,
    });
  } else {
    checks.push({
      name: "suite",
      ok: true,
      detail: "no commands.workerScopedSuite configured — skipped",
    });
  }

  return {
    ticket,
    ok: checks.every((check) => check.ok),
    baseline: dispatch.baseline,
    head,
    checks,
    at: now().toISOString(),
  };
}

async function spawnCapture(command: readonly string[], cwd: string): Promise<CommandOutcome> {
  const proc = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

/**
 * The argv that re-spawns `forge handoff --check`: the executable itself when
 * compiled (it embeds the dispatcher), `bun <forge.ts>` from source.
 */
export function handoffCheckCommand(handoffPath: string, compiled: boolean): string[] {
  const subcommand = ["handoff", "--check", handoffPath];
  if (compiled) return [process.execPath, ...subcommand];
  return [process.execPath, path.join(import.meta.dir, "..", "bin", "forge.ts"), ...subcommand];
}

export function gitDependencies(
  worktree: string,
  handoffPath: string,
  workerScopedSuite: string | undefined,
): VerifyDependencies {
  const git = async (args: string[]): Promise<string> => {
    const result = await spawnCapture(["git", ...args], worktree);
    if (result.exitCode !== 0)
      throw new Error(`git ${args.join(" ")} failed: ${result.output.trim()}`);
    return result.output;
  };
  return {
    head: async () => (await git(["rev-parse", "HEAD"])).trim(),
    commitCount: async (baseline) =>
      Number((await git(["rev-list", "--count", `${baseline}..HEAD`])).trim()),
    changedPaths: async (baseline) =>
      (await git(["diff", "--name-only", `${baseline}..HEAD`])).split("\n").filter(Boolean),
    handoffCheck: () =>
      spawnCapture(handoffCheckCommand(handoffPath, isCompiledBinary()), worktree),
    workerScopedSuite,
    runSuite: (command) => spawnCapture(["sh", "-c", command], worktree),
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function parseDispatchRecord(raw: unknown): DispatchRecord {
  const candidate: Record<string, unknown> = isObject(raw) ? raw : {};
  const surfaces = candidate.surfaces;
  if (
    typeof candidate.baseline !== "string" ||
    !Array.isArray(surfaces) ||
    !surfaces.every((glob) => typeof glob === "string")
  ) {
    throw new Error("dispatch record needs { baseline: string, surfaces: string[] }");
  }
  return { baseline: candidate.baseline, surfaces };
}

function resolveRunId(repoRoot: string, ticket: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  const runsDir = path.join(repoRoot, ".forge", "runs");
  const candidates = existsSync(runsDir)
    ? readdirSync(runsDir).filter((candidateRun) =>
        existsSync(path.join(runsDir, candidateRun, "dispatch", `${ticket}.json`)),
      )
    : [];
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? `no dispatch record found for ${ticket} under ${runsDir} — pass --run <id>`
        : `${ticket} has dispatch records in several runs (${candidates.join(", ")}) — pass --run <id>`,
    );
  }
  return candidates[0]!;
}

async function readWorkerScopedSuite(
  workTree: string,
  baseline: string,
): Promise<string | undefined> {
  const shown = await Bun.$`git -C ${workTree} show ${baseline}:forge.config.json`
    .nothrow()
    .quiet();
  if (shown.exitCode !== 0) return undefined;
  let config: { commands?: { workerScopedSuite?: unknown } };
  try {
    config = JSON.parse(shown.stdout.toString());
  } catch {
    return undefined;
  }
  const suite = config.commands?.workerScopedSuite;
  return typeof suite === "string" && suite.length > 0 ? suite : undefined;
}

function parseArguments(argv: readonly string[]): {
  ticket?: string;
  run?: string;
  worktree?: string;
  bad: boolean;
} {
  const positional: string[] = [];
  const options: Record<string, string | undefined> = {};
  let bad = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--run" || argument === "--worktree") {
      const value = argv[++index];
      if (!value) bad = true;
      options[argument] = value;
    } else {
      positional.push(argument);
    }
  }
  return {
    ...optionalProperty("ticket", positional[0]),
    ...optionalProperty("run", options["--run"]),
    ...optionalProperty("worktree", options["--worktree"]),
    bad,
  };
}

export async function run(argv: string[]): Promise<void> {
  const { ticket, run: explicitRun, worktree, bad } = parseArguments(argv);
  if (!ticket || bad) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  try {
    for (const [label, value] of [
      ["ticket", ticket],
      ["--run", explicitRun],
    ] as const) {
      if (value !== undefined && !/^[\w-]+$/.test(value)) {
        throw new Error(`invalid ${label} id "${value}"`);
      }
    }
    const repoRoot = (await resolveRepoRoot()) ?? process.cwd();
    const runId = resolveRunId(repoRoot, ticket, explicitRun);
    const runDir = path.join(repoRoot, ".forge", "runs", runId);
    const dispatch = parseDispatchRecord(readJson(path.join(runDir, "dispatch", `${ticket}.json`)));
    const workTree = path.resolve(worktree ?? process.cwd());
    const handoffPath = path.join(workTree, ".forge", `handoff-${ticket}.md`);
    const record = await verifyTicket(
      ticket,
      dispatch,
      gitDependencies(
        workTree,
        handoffPath,
        await readWorkerScopedSuite(workTree, dispatch.baseline),
      ),
    );
    const verifyDir = path.join(runDir, "verify");
    mkdirSync(verifyDir, { recursive: true });
    writeFileSync(path.join(verifyDir, `${ticket}.json`), JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify(record));
    if (!record.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`forge verify: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
