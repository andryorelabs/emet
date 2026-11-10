import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { configureTicketPattern, listReservations } from "./claims";
import { buildRunHome } from "./codex-home";
import { resolveCodexModel } from "./codex-models";
import {
  codexWorkerLiveness,
  isPidTrusted,
  readCodexState,
  refreshThreadId,
  spawnCodex,
  type CodexState,
} from "./codex-process";
import {
  loadForgeConfigWithDefaults,
  resolveCodexConfig,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import { listOpenQuestions } from "./mailbox";
import { buildLockReason, readLockReasonTemplate } from "./lockreason";
import { errorMessage } from "./narrow";
import { resolveRunDir } from "./names";
import { readResult } from "./results";
import { runDirectory } from "./runs";
import { listOccupiedSlots } from "./slots";

const USAGE = `usage: emet dispatch --role worker --run <id> --ticket <id> --prompt-file <f> [--model <m>] [--effort <e>] [--root <dir>]
       emet dispatch --wait --run <id> --ticket <id> [--timeout <s>] [--root <dir>]`;

/** Exit status when the worktree is not on the dispatch record's baseline. */
export const EXIT_BASE_CHECK_FAILED = 42;
/** Exit status when `--wait` runs out of time. */
export const EXIT_WAIT_TIMEOUT = 124;

const TICKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const POLL_INTERVAL_MS = 200;
const THREAD_ID_TIMEOUT_MS = 3000;
const THREAD_ID_POLL_MS = 50;

/** Overrides for tests; production callers pass none. */
export type DispatchDeps = {
  readonly forgeDirectory?: string;
  readonly slotsDirectory?: string;
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly sourceHome?: string;
  readonly cachePath?: string;
  /** How long dispatch waits for `thread.started` before printing `thread pending`. */
  readonly threadIdTimeoutMs?: number;
};

/** The JSON schema of the final report a Codex worker returns through `--output-schema`. */
const WORKER_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "risk"],
  properties: {
    status: { enum: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"] },
    summary: { type: "string" },
    risk: { type: "string" },
  },
} as const;

class DispatchError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined) throw new DispatchError(`${flag} requires a value`, 2);
  return value;
}

type Paths = {
  readonly runDir: string;
  readonly codexDir: string;
  readonly worktree: string;
  readonly jsonl: string;
  readonly stateFile: string;
  readonly report: string;
  readonly schema: string;
  readonly dispatchRecord: string;
};

function pathsFor(root: string, runId: string, ticket: string): Paths {
  const runDir = path.join(resolveRunDir(root).path, "runs", runId);
  const codexDir = path.join(runDir, "codex");
  return {
    runDir,
    codexDir,
    worktree: path.join(root, ".emet", "worktrees", `agent-${ticket}`),
    jsonl: path.join(codexDir, `${ticket}.jsonl`),
    stateFile: path.join(codexDir, `${ticket}.state.json`),
    report: path.join(codexDir, `${ticket}.report.json`),
    schema: path.join(codexDir, "worker-report.schema.json"),
    dispatchRecord: path.join(runDir, "dispatch", `${ticket}.json`),
  };
}

async function git(cwd: string, args: readonly string[]): Promise<{ ok: boolean; out: string }> {
  const result = await Bun.$`git ${args}`.cwd(cwd).nothrow().quiet();
  return { ok: result.exitCode === 0, out: result.stdout.toString().trim() };
}

function readBaseline(recordPath: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch {
    throw new DispatchError(`no dispatch record at ${recordPath}`);
  }
  const baseline =
    typeof raw === "object" && raw !== null && "baseline" in raw ? raw.baseline : undefined;
  if (typeof baseline !== "string" || baseline.length === 0) {
    throw new DispatchError(`dispatch record ${recordPath} has no baseline`);
  }
  return baseline;
}

async function requireClaimAndSlot(
  runId: string,
  ticket: string,
  deps: DispatchDeps,
): Promise<{ anchorPid: number; sessionSlug: string }> {
  const reservations = await listReservations(deps.forgeDirectory);
  const claim = reservations.find((entry) => entry.ticket === ticket && entry.runId === runId);
  if (claim === undefined) throw new DispatchError(`no claim for ${ticket} under runId ${runId}`);
  if (claim.surfaces === undefined || claim.surfaces.length === 0) {
    throw new DispatchError(
      `claim for ${ticket} under runId ${runId} has no surfaces; reserve it with --surfaces`,
    );
  }
  const slots = await listOccupiedSlots(deps.slotsDirectory);
  const slot = slots.find(
    (entry) => entry.holder.ticket === ticket && entry.holder.runId === runId,
  );
  if (slot === undefined)
    throw new DispatchError(`no slot held for ${ticket} under runId ${runId}`);
  return { anchorPid: claim.anchorPid, sessionSlug: claim.sessionSlug };
}

async function createLockedWorktree(
  root: string,
  paths: Paths,
  ticket: string,
  baseline: string,
  lockReason: string,
): Promise<void> {
  const known = await git(root, ["cat-file", "-e", `${baseline}^{commit}`]);
  if (!known.ok) {
    throw new DispatchError(
      `base check failed: ${baseline} is not a commit`,
      EXIT_BASE_CHECK_FAILED,
    );
  }
  if (existsSync(paths.worktree)) {
    throw new DispatchError(`worktree already exists: ${paths.worktree}`);
  }
  mkdirSync(path.dirname(paths.worktree), { recursive: true });
  const added = await git(root, [
    "worktree",
    "add",
    "-b",
    `worktree-agent-${ticket}`,
    paths.worktree,
    baseline,
  ]);
  if (!added.ok) throw new DispatchError(`git worktree add failed: ${added.out}`);
  const head = await git(paths.worktree, ["rev-parse", "HEAD"]);
  const expected = await git(root, ["rev-parse", `${baseline}^{commit}`]);
  if (head.out !== expected.out) {
    throw new DispatchError(
      `base check failed: HEAD ${head.out} differs from baseline ${expected.out}`,
      EXIT_BASE_CHECK_FAILED,
    );
  }
  const locked = await git(paths.worktree, ["worktree", "lock", "--reason", lockReason, "."]);
  if (!locked.ok) throw new DispatchError(`git worktree lock failed: ${locked.out}`);
}

function chooseModel(
  argv: readonly string[],
  config: ForgeConfig,
  cachePath: string | undefined,
): { model: string | undefined; effort: string } {
  const resolved =
    cachePath === undefined
      ? resolveCodexModel("worker", config)
      : resolveCodexModel("worker", config, cachePath);
  if (resolved.substituted !== undefined) {
    console.error(
      `emet dispatch: model ${resolved.substituted.from} substituted: ${resolved.substituted.reason}`,
    );
  }
  const effort = flagValue(argv, "--effort") ?? resolved.effort;
  if (effort === "ultra") throw new DispatchError("effort ultra is never sent", 2);
  return { model: flagValue(argv, "--model") ?? resolved.model, effort };
}

async function dispatchWorker(
  argv: readonly string[],
  root: string,
  deps: DispatchDeps,
): Promise<number> {
  const runId = requireFlag(argv, "--run");
  const ticket = requireFlag(argv, "--ticket");
  const promptFile = requireFlag(argv, "--prompt-file");
  if (flagValue(argv, "--role") !== "worker") throw new DispatchError("--role must be worker", 2);
  if (!RUN_PATTERN.test(runId) || !TICKET_PATTERN.test(ticket) || ticket.includes("..")) {
    throw new DispatchError(`invalid run or ticket id: ${runId} ${ticket}`, 2);
  }
  if (!existsSync(promptFile)) throw new DispatchError(`prompt file not found: ${promptFile}`, 2);

  const { config } = await loadForgeConfigWithDefaults(root);
  configureTicketPattern(config.ticket.idPattern);
  const { anchorPid, sessionSlug } = await requireClaimAndSlot(runId, ticket, deps);
  const paths = pathsFor(root, runId, ticket);
  const baseline = readBaseline(paths.dispatchRecord);
  const { model, effort } = chooseModel(argv, config, deps.cachePath);

  const lockReason = buildLockReason(
    {
      runId: runId,
      ticket,
      anchorPid,
      coordinatorSlug: sessionSlug,
      iso: new Date().toISOString(),
    },
    await readLockReasonTemplate(root),
  );
  await createLockedWorktree(root, paths, ticket, baseline, lockReason);

  const { codexHome } = buildRunHome({
    run: runId,
    repoRoot: root,
    ...(deps.sourceHome === undefined ? {} : { sourceHome: deps.sourceHome }),
  });
  mkdirSync(paths.codexDir, { recursive: true });
  writeFileSync(paths.schema, `${JSON.stringify(WORKER_REPORT_SCHEMA, null, 2)}\n`);

  const commonDir = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const sharedWritableArgs =
    commonDir.ok && commonDir.out.length > 0 ? ["--add-dir", commonDir.out] : [];

  const args = [
    "exec",
    "-C",
    paths.worktree,
    ...sharedWritableArgs,
    ...(model === undefined ? [] : ["-m", model]),
    "-c",
    `model_reasoning_effort=${effort}`,
    "-s",
    resolveCodexConfig(config).sandbox,
    "--json",
    "--output-schema",
    paths.schema,
    "-o",
    paths.report,
    "--dangerously-bypass-hook-trust",
    readFileSync(promptFile, "utf8"),
  ];
  const { pid } = spawnCodex({
    args,
    cwd: paths.worktree,
    codexHome,
    jsonlPath: paths.jsonl,
    stateFile: paths.stateFile,
    ...(deps.executable === undefined ? {} : { executable: deps.executable }),
    ...(deps.env === undefined ? {} : { env: deps.env }),
  });
  const threadId = await awaitThreadId(
    paths.stateFile,
    deps.threadIdTimeoutMs ?? THREAD_ID_TIMEOUT_MS,
    config,
  );
  console.log(
    `dispatched ${ticket}: pid ${pid}, worktree ${paths.worktree}, thread ${threadId ?? "pending"}, jsonl ${paths.jsonl}`,
  );
  return 0;
}

function livenessProbe(config: ForgeConfig): { idleMs: number } {
  return { idleMs: config.usage.stalledMinutes * 60_000 };
}

/**
 * Polls the worker's stream for `thread.started` and records the thread id,
 * the worker's identity. Gives up at the timeout or once the worker is over.
 */
async function awaitThreadId(
  stateFile: string,
  timeoutMs: number,
  config: ForgeConfig,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = refreshThreadId(stateFile);
    if (state === undefined || state.threadId !== null) return state?.threadId ?? null;
    const liveness = codexWorkerLiveness(state, livenessProbe(config));
    if (liveness === "done" || liveness === "exited" || Date.now() >= deadline) return null;
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling on purpose
    await Bun.sleep(THREAD_ID_POLL_MS);
  }
}

/**
 * What `--wait` does next: `running` while the stream is live, or quiet
 * while a pid from this namespace is alive; `over` after a finished turn or
 * an exited pid; `stalled` for a silent worker from another pid namespace.
 */
function workerWaitState(state: CodexState, config: ForgeConfig): "running" | "over" | "stalled" {
  const probe = livenessProbe(config);
  const liveness = codexWorkerLiveness(state, probe);
  if (liveness === "live") return "running";
  if (liveness === "stalled") return isPidTrusted(state, probe) ? "running" : "stalled";
  return "over";
}

async function resolveCommonDirectory(root: string): Promise<string> {
  const resolved = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return resolved.ok && resolved.out.length > 0 ? resolved.out : root;
}

function firstOpenQuestion(
  commonDirectory: string,
  runId: string,
  ticket: string,
): { id: number } | undefined {
  return listOpenQuestions(runId, { commonDirectory }).find((entry) => entry.ticket === ticket);
}

async function waitForWorker(argv: readonly string[], root: string): Promise<number> {
  const runId = requireFlag(argv, "--run");
  const ticket = requireFlag(argv, "--ticket");
  if (!RUN_PATTERN.test(runId) || !TICKET_PATTERN.test(ticket) || ticket.includes("..")) {
    throw new DispatchError(`invalid run or ticket id: ${runId} ${ticket}`, 2);
  }
  const timeoutRaw = flagValue(argv, "--timeout");
  const timeoutSeconds = timeoutRaw === undefined ? undefined : Number(timeoutRaw);
  if (timeoutSeconds !== undefined && !(timeoutSeconds >= 0)) {
    throw new DispatchError(`invalid --timeout: ${timeoutRaw}`, 2);
  }
  const paths = pathsFor(root, runId, ticket);
  if (readCodexState(paths.stateFile) === undefined) {
    throw new DispatchError(`no dispatched worker for ${ticket}`);
  }
  const { config } = await loadForgeConfigWithDefaults(root);
  const commonDirectory = await resolveCommonDirectory(root);
  const resultsDirectory = path.join(runDirectory(commonDirectory, runId), "results");

  const deadline = timeoutSeconds === undefined ? Infinity : Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const state = refreshThreadId(paths.stateFile);
    if (state === undefined) throw new DispatchError(`no dispatched worker for ${ticket}`);
    const running = workerWaitState(state, config);
    if (running === "over") break;
    if (readResult(resultsDirectory, ticket) !== null) break;
    const question = firstOpenQuestion(commonDirectory, runId, ticket);
    if (question !== undefined) {
      console.log(`question ${ticket} ${String(question.id)}`);
      return 0;
    }
    if (running === "stalled") {
      console.error(
        `emet dispatch: ${ticket} stalled: no event in ${config.usage.stalledMinutes} minutes (thread ${state.threadId ?? "pending"})`,
      );
      return 1;
    }
    if (Date.now() >= deadline) {
      console.error(`emet dispatch: timed out waiting for ${ticket}`);
      return EXIT_WAIT_TIMEOUT;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling on purpose
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  const result = readResult(resultsDirectory, ticket);
  if (result === null) {
    console.error(`emet dispatch: ${ticket} exited without a recorded result`);
    return 1;
  }
  console.log(result.status);
  return 0;
}

/**
 * `emet dispatch`: starts a Codex worker for a claimed ticket, or with
 * `--wait` blocks until it exits and prints its recorded result status.
 * Returns the process exit code: 1 for a missing claim, slot or record,
 * 2 for usage errors, 42 when the base check fails.
 */
export async function run(argv: string[], deps: DispatchDeps = {}): Promise<number> {
  if (argv.length === 0 || argv.includes("--help")) {
    console.error(USAGE);
    return 2;
  }
  try {
    const root = flagValue(argv, "--root") ?? (await resolveRepoRoot());
    if (root === null) throw new DispatchError("not inside a git repository");
    return argv.includes("--wait")
      ? await waitForWorker(argv, root)
      : await dispatchWorker(argv, root, deps);
  } catch (error) {
    if (error instanceof DispatchError) {
      console.error(`emet dispatch: ${error.message}`);
      if (error.exitCode === 2) console.error(USAGE);
      return error.exitCode;
    }
    console.error(`emet dispatch: ${errorMessage(error)}`);
    return 1;
  }
}
