/**
 * The global append-only journal of emet's own events, one JSON object per line
 * in `<stateDir()>/journal/events.jsonl`. It records ids, codes, counts,
 * durations and a short `reason`; never prompts, assistant text, hook stdin,
 * environment variables, argv, tokens, diffs or issue bodies. A journal
 * failure never reaches the caller.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { didAcquireLock } from "./locks";
import { stateDir } from "./names";
import { isObject, isOneOf } from "./narrow";

const JOURNAL_KINDS = [
  "run.start",
  "gate.decision",
  "intervention",
  "launch.result",
  "promote",
  "cleanup",
  "ticket.close",
  "baseline",
  "spec.integrate",
  "spec.land",
  "spec.abandon",
  "session.attention",
  "self.update",
] as const;

/** One of the event kinds the journal accepts. */
export type JournalKind = (typeof JOURNAL_KINDS)[number];

/** One journal line. */
export interface JournalEvent {
  v: 1;
  ts: string;
  id: string;
  kind: JournalKind;
  runId?: string;
  repo: string;
  host: string;
  origin: "human" | "auto";
  pid: number;
  data: Record<string, unknown>;
  truncated?: true;
}

/** What a caller supplies; `v`, `ts`, `id`, `pid` and `host` are filled in. */
export type JournalEventInput = Omit<
  JournalEvent,
  "v" | "ts" | "id" | "pid" | "host" | "truncated"
>;

/** Test seams; every field defaults to the real thing. */
export interface JournalDeps {
  directory?: string;
  now?: () => Date;
  maxEventBytes?: number;
  rotateAtBytes?: number;
  keepSegments?: number;
}

const MAX_EVENT_BYTES = 2048;
const MAX_REASON_LENGTH = 200;
const ROTATE_AT_BYTES = 10 * 1024 * 1024;
const KEEP_SEGMENTS = 5;
const STALE_LOCK_MS = 60_000;
const CURRENT_FILE = "events.jsonl";
const SEGMENT_PATTERN = /^events\.(\d+)\.jsonl$/;

function journalDirectory(deps: JournalDeps | undefined): string {
  return deps?.directory ?? path.join(stateDir(), "journal");
}

function clampReason(data: Record<string, unknown>): Record<string, unknown> {
  const { reason } = data;
  if (typeof reason !== "string" || reason.length <= MAX_REASON_LENGTH) return data;
  return { ...data, reason: reason.slice(0, MAX_REASON_LENGTH) };
}

function serialize(event: JournalEvent, maxBytes: number): string | null {
  const line = JSON.stringify(event);
  if (Buffer.byteLength(line) + 1 <= maxBytes) return `${line}\n`;
  const trimmed = `${JSON.stringify({ ...event, data: {}, truncated: true })}\n`;
  return Buffer.byteLength(trimmed) <= maxBytes ? trimmed : null;
}

function segmentNumbers(directory: string): number[] {
  return readdirSync(directory)
    .map((name) => SEGMENT_PATTERN.exec(name)?.[1])
    .filter((digits): digits is string => digits !== undefined)
    .map(Number)
    .toSorted((left, right) => left - right);
}

function segmentPath(directory: string, number: number): string {
  return path.join(directory, `events.${number}.jsonl`);
}

function removeStaleLock(lockDirectory: string): void {
  try {
    if (Date.now() - statSync(lockDirectory).mtimeMs > STALE_LOCK_MS) {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  } catch {
    return;
  }
}

function shiftSegments(directory: string, keep: number): void {
  for (const number of segmentNumbers(directory).toReversed()) {
    if (number >= keep) rmSync(segmentPath(directory, number), { force: true });
    else renameSync(segmentPath(directory, number), segmentPath(directory, number + 1));
  }
  renameSync(path.join(directory, CURRENT_FILE), segmentPath(directory, 1));
}

/**
 * Renames `events.jsonl` to `events.1.jsonl` (older segments shift, the oldest
 * past the keep count is deleted) when it is over the size limit. A process
 * that cannot take the non-blocking lock does nothing and appends anyway.
 */
export function rotateIfNeeded(deps?: JournalDeps): void {
  const directory = journalDirectory(deps);
  const current = path.join(directory, CURRENT_FILE);
  try {
    if (!existsSync(current) || statSync(current).size < (deps?.rotateAtBytes ?? ROTATE_AT_BYTES)) {
      return;
    }
    const lockDirectory = path.join(directory, "rotate.lock");
    removeStaleLock(lockDirectory);
    const holder = { pid: process.pid, worktree: directory, acquiredAt: Date.now() };
    if (!didAcquireLock(lockDirectory, holder)) return;
    try {
      if (statSync(current).size >= (deps?.rotateAtBytes ?? ROTATE_AT_BYTES)) {
        shiftSegments(directory, deps?.keepSegments ?? KEEP_SEGMENTS);
      }
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  } catch {
    return;
  }
}

/** Appends one event with a single `appendFileSync`; never throws. */
export function appendEvent(event: JournalEventInput, deps?: JournalDeps): void {
  try {
    const directory = journalDirectory(deps);
    mkdirSync(directory, { recursive: true });
    rotateIfNeeded(deps);
    const full: JournalEvent = {
      v: 1,
      ts: (deps?.now?.() ?? new Date()).toISOString(),
      id: crypto.randomUUID(),
      ...event,
      host: os.hostname(),
      pid: process.pid,
      data: clampReason(event.data),
    };
    const line = serialize(full, deps?.maxEventBytes ?? MAX_EVENT_BYTES);
    if (line === null) return;
    appendFileSync(path.join(directory, CURRENT_FILE), line);
  } catch {
    return;
  }
}

function isJournalEvent(value: unknown): value is JournalEvent {
  return (
    isObject(value) &&
    !Array.isArray(value) &&
    value.v === 1 &&
    isOneOf(JOURNAL_KINDS, value.kind) &&
    typeof value.ts === "string" &&
    isObject(value.data)
  );
}

function parseEvent(line: string): JournalEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return isJournalEvent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Every segment oldest first, then the current file; unparseable lines are counted. */
export function readJournalSegments(deps?: JournalDeps): {
  events: JournalEvent[];
  skippedLines: number;
} {
  const events: JournalEvent[] = [];
  let skippedLines = 0;
  try {
    const directory = journalDirectory(deps);
    const files = [
      ...segmentNumbers(directory)
        .toReversed()
        .map((number) => segmentPath(directory, number)),
      path.join(directory, CURRENT_FILE),
    ];
    for (const file of files) {
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (line.trim() === "") continue;
        const event = parseEvent(line);
        if (event === undefined) skippedLines += 1;
        else events.push(event);
      }
    }
  } catch {
    return { events, skippedLines };
  }
  return { events, skippedLines };
}

function readTail(file: string, maxBytes: number): string {
  const descriptor = openSync(file, "r");
  try {
    const size = fstatSync(descriptor).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    readSync(descriptor, buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    return start === 0 ? text : text.slice(text.indexOf("\n") + 1);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * The valid events among at most the last `maxBytes` of the current file,
 * newest first, keeping only lines `matches` accepts before parsing them. A
 * partial first line, rotated segments and any read failure yield nothing.
 */
export function readRecentEvents(
  maxBytes: number,
  matches: (line: string) => boolean,
  deps?: JournalDeps,
): JournalEvent[] {
  try {
    const file = path.join(journalDirectory(deps), CURRENT_FILE);
    if (!existsSync(file)) return [];
    return readTail(file, maxBytes)
      .split("\n")
      .toReversed()
      .filter((line) => line.trim() !== "" && matches(line))
      .map((line) => parseEvent(line))
      .filter((event): event is JournalEvent => event !== undefined);
  } catch {
    return [];
  }
}
