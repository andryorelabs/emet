import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { loadForgeConfig } from "./config";
import { didAcquireLock, didReclaimStaleLock, releaseLock } from "./locks";
import { errorMessage, isObject } from "./narrow";
import { assertSafeId, runDirectory, writeJsonAtomically } from "./runs";

const USAGE = `usage: emet ask --run <id> --ticket <ticket> --body <text>
       emet ask --run <id> --ticket <ticket> --wait <n> [--slice <seconds>]
       emet inbox --run <id>
       emet reply --run <id> --ticket <ticket> --id <n> --body <text>

Questions and replies live in <git-common-dir>/.emet/runs/<id>/mailbox/<ticket>/<n>.{question,reply}.json.
ask --wait exits 0 with the reply body, 3 when the slice elapses, 4 when the wait budget is spent.`;

const EXIT_SLICE_TIMEOUT = 3;
const EXIT_EXPIRED = 4;
const DEFAULT_SLICE_SECONDS = 60;
const DEFAULT_ASK_WAIT_MINUTES = 30;
const POLL_INTERVAL_MS = 1000;
const COUNTER_LOCK_ATTEMPTS = 200;
const COUNTER_LOCK_RETRY_MS = 25;
const COUNTER_LOCK_STALE_MS = 30_000;

export interface OpenQuestion {
  readonly ticket: string;
  readonly id: number;
  readonly body: string;
  readonly askedAt: string;
}

export interface WaitResult {
  readonly status: "reply" | "timeout" | "expired";
  readonly body?: string;
}

/** Test seams: the git-common-dir, the clock and the sleeper. */
export interface MailboxOptions {
  readonly commonDirectory?: string;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => void;
}

function resolveCommonDirectory(options: MailboxOptions | undefined): string {
  if (options?.commonDirectory !== undefined) return options.commonDirectory;
  const result = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const resolved = result.stdout.toString().trim();
  if (result.exitCode !== 0 || resolved.length === 0) {
    throw new Error("could not resolve the git common dir; run inside a git repo");
  }
  return resolved;
}

function defaultSleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function mailboxDirectory(commonDirectory: string, runId: string, ticket?: string): string {
  const base = path.join(runDirectory(commonDirectory, runId), "mailbox");
  if (ticket === undefined) return base;
  assertSafeId("ticket", ticket);
  return path.join(base, ticket);
}

function questionPath(directory: string, id: number): string {
  return path.join(directory, `${id}.question.json`);
}

function replyPath(directory: string, id: number): string {
  return path.join(directory, `${id}.reply.json`);
}

function assertQuestionId(id: number): void {
  if (!Number.isInteger(id) || id < 1) throw new Error(`invalid question id ${String(id)}`);
}

function questionIdsIn(directory: string): number[] {
  if (!existsSync(directory)) return [];
  const ids: number[] = [];
  for (const name of readdirSync(directory)) {
    const match = /^(\d+)\.question\.json$/.exec(name);
    if (match?.[1] !== undefined) ids.push(Number(match[1]));
  }
  return ids;
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!isObject(parsed)) throw new Error(`${filePath} is not a JSON object`);
  return parsed;
}

function readBody(filePath: string): string {
  const { body } = readJsonObject(filePath);
  if (typeof body !== "string") throw new Error(`${filePath} has no string body`);
  return body;
}

function withCounterLock<T>(
  directory: string,
  sleep: (milliseconds: number) => void,
  action: () => T,
): T {
  mkdirSync(directory, { recursive: true });
  const lockDirectory = path.join(directory, ".id.lock");
  const holder = { pid: process.pid, worktree: process.cwd(), acquiredAt: Date.now() };
  for (let attempt = 0; attempt < COUNTER_LOCK_ATTEMPTS; attempt++) {
    if (didAcquireLock(lockDirectory, holder)) {
      try {
        return action();
      } finally {
        releaseLock(lockDirectory);
      }
    }
    if (didReclaimStaleLock(lockDirectory, COUNTER_LOCK_STALE_MS)) continue;
    sleep(COUNTER_LOCK_RETRY_MS);
  }
  throw new Error(`timed out waiting for the question id lock in ${directory}`);
}

/** Records a question for a ticket and returns its per-ticket id. */
export function askQuestion(
  runId: string,
  ticket: string,
  body: string,
  options?: MailboxOptions,
): { id: number } {
  const directory = mailboxDirectory(resolveCommonDirectory(options), runId, ticket);
  const now = options?.now ?? Date.now;
  return withCounterLock(directory, options?.sleep ?? defaultSleep, () => {
    const id = Math.max(0, ...questionIdsIn(directory)) + 1;
    writeJsonAtomically(questionPath(directory, id), {
      id,
      ticket,
      body,
      askedAt: new Date(now()).toISOString(),
    });
    return { id };
  });
}

/**
 * Polls for a reply for up to `sliceSeconds`. Returns `expired` once the question is older than
 * `maxMinutes`, `timeout` when the slice ends first, `reply` with the body otherwise.
 */
export function waitForReply(
  runId: string,
  ticket: string,
  id: number,
  sliceSeconds: number,
  maxMinutes: number,
  options?: MailboxOptions,
): WaitResult {
  assertQuestionId(id);
  const directory = mailboxDirectory(resolveCommonDirectory(options), runId, ticket);
  const question = questionPath(directory, id);
  if (!existsSync(question)) throw new Error(`question ${String(id)} of ${ticket} does not exist`);
  const askedAt = Date.parse(String(readJsonObject(question).askedAt));
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? defaultSleep;
  const sliceEnd = now() + sliceSeconds * 1000;
  for (;;) {
    const reply = replyPath(directory, id);
    if (existsSync(reply)) return { status: "reply", body: readBody(reply) };
    if (now() - askedAt > maxMinutes * 60_000) return { status: "expired" };
    if (now() >= sliceEnd) return { status: "timeout" };
    sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, sliceEnd - now())));
  }
}

/** Lists every question of the run that has no reply yet. */
export function listOpenQuestions(runId: string, options?: MailboxOptions): OpenQuestion[] {
  const root = mailboxDirectory(resolveCommonDirectory(options), runId);
  if (!existsSync(root)) return [];
  const open: OpenQuestion[] = [];
  for (const ticket of readdirSync(root)) {
    const directory = path.join(root, ticket);
    for (const id of questionIdsIn(directory)) {
      if (existsSync(replyPath(directory, id))) continue;
      const { body, askedAt } = readJsonObject(questionPath(directory, id));
      if (typeof body !== "string" || typeof askedAt !== "string") continue;
      open.push({ ticket, id, body, askedAt });
    }
  }
  return open.toSorted((a, b) => a.ticket.localeCompare(b.ticket) || a.id - b.id);
}

/** Writes the reply to an open question; throws when it is missing or already answered. */
export function writeReply(
  runId: string,
  ticket: string,
  id: number,
  body: string,
  options?: MailboxOptions,
): void {
  assertQuestionId(id);
  const directory = mailboxDirectory(resolveCommonDirectory(options), runId, ticket);
  if (!existsSync(questionPath(directory, id))) {
    throw new Error(`question ${String(id)} of ${ticket} does not exist`);
  }
  const now = options?.now ?? Date.now;
  withCounterLock(directory, options?.sleep ?? defaultSleep, () => {
    if (existsSync(replyPath(directory, id))) {
      throw new Error(`question ${String(id)} of ${ticket} already has a reply`);
    }
    writeJsonAtomically(replyPath(directory, id), {
      id,
      ticket,
      body,
      repliedAt: new Date(now()).toISOString(),
    });
  });
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function requireFlag(argv: readonly string[], name: string): string {
  const value = readFlag(argv, name);
  if (value === undefined) throw new Error(`missing ${name}`);
  return value;
}

function parseCount(label: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

async function resolveAskWaitMinutes(): Promise<number> {
  const root = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim();
  const loaded = await loadForgeConfig(root.length > 0 ? root : process.cwd());
  return loaded.status === "ok" ? loaded.config.budgets.askWaitMinutes : DEFAULT_ASK_WAIT_MINUTES;
}

async function runAsk(argv: readonly string[]): Promise<void> {
  const runId = requireFlag(argv, "--run");
  const ticket = requireFlag(argv, "--ticket");
  const waitRaw = readFlag(argv, "--wait");
  if (waitRaw === undefined) {
    console.log(JSON.stringify(askQuestion(runId, ticket, requireFlag(argv, "--body"))));
    return;
  }
  const sliceRaw = readFlag(argv, "--slice");
  const slice = sliceRaw === undefined ? DEFAULT_SLICE_SECONDS : parseCount("--slice", sliceRaw);
  const result = waitForReply(
    runId,
    ticket,
    parseCount("--wait", waitRaw),
    slice,
    await resolveAskWaitMinutes(),
  );
  if (result.status === "reply") {
    console.log(result.body ?? "");
    return;
  }
  process.exitCode = result.status === "timeout" ? EXIT_SLICE_TIMEOUT : EXIT_EXPIRED;
}

/** Entry point for `emet ask`, `emet inbox` and `emet reply`. */
export async function run(command: string, argv: readonly string[]): Promise<void> {
  try {
    if (command === "ask") {
      await runAsk(argv);
    } else if (command === "inbox") {
      console.log(JSON.stringify(listOpenQuestions(requireFlag(argv, "--run")), null, 2));
    } else {
      writeReply(
        requireFlag(argv, "--run"),
        requireFlag(argv, "--ticket"),
        parseCount("--id", requireFlag(argv, "--id")),
        requireFlag(argv, "--body"),
      );
    }
  } catch (error) {
    console.error(`emet ${command}: ${errorMessage(error)}\n${USAGE}`);
    process.exitCode = 1;
  }
}
