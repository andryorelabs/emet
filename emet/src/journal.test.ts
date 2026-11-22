import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendEvent,
  readJournalSegments,
  readRecentEvents,
  rotateIfNeeded,
  type JournalDeps,
  type JournalEvent,
  type JournalKind,
  type JournalEventInput,
} from "./journal";

let root: string;
let directory: string;
let deps: JournalDeps;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "emet-journal-"));
  directory = path.join(root, "journal");
  deps = { directory };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const decisionKind: JournalKind = "gate.decision";

function event(data: Record<string, unknown> = {}): JournalEventInput {
  return { kind: decisionKind, repo: "r", origin: "human", data };
}

function currentLines(): string[] {
  return readFileSync(path.join(directory, "events.jsonl"), "utf8").trim().split("\n");
}

function stored(): JournalEvent[] {
  return readJournalSegments(deps).events;
}

describe("appendEvent", () => {
  test("accepts the three spec.* kinds", () => {
    for (const kind of ["spec.integrate", "spec.land", "spec.abandon"] as const) {
      appendEvent({ ...event(), kind }, deps);
    }
    expect(stored().map((entry) => entry.kind)).toEqual([
      "spec.integrate",
      "spec.land",
      "spec.abandon",
    ]);
  });

  test("writes one line with the envelope fields", () => {
    appendEvent({ ...event({ ticket: "CLA-1" }), runId: "run1" }, deps);
    const [parsed] = stored();
    expect(parsed).toMatchObject({
      v: 1,
      kind: "gate.decision",
      runId: "run1",
      repo: "r",
      origin: "human",
      pid: process.pid,
      data: { ticket: "CLA-1" },
    });
    expect(typeof parsed?.id).toBe("string");
    expect(typeof parsed?.host).toBe("string");
    expect(Number.isNaN(Date.parse(parsed?.ts ?? ""))).toBe(false);
  });

  test("uses the injected clock and the default state directory", () => {
    const previous = process.env.EMET_STATE_DIR;
    process.env.EMET_STATE_DIR = root;
    try {
      appendEvent(event(), { now: () => new Date("2026-01-02T03:04:05.000Z") });
    } finally {
      if (previous === undefined) delete process.env.EMET_STATE_DIR;
      else process.env.EMET_STATE_DIR = previous;
    }
    const [written] = readJournalSegments({ directory: path.join(root, "journal") }).events;
    expect(written?.ts).toBe("2026-01-02T03:04:05.000Z");
  });

  test("cuts a 500 character reason to 200", () => {
    appendEvent(event({ reason: "x".repeat(500) }), deps);
    expect(stored()[0]?.data.reason).toHaveLength(200);
  });

  test("keeps a short reason and non-string reasons as they are", () => {
    appendEvent(event({ reason: "short" }), deps);
    appendEvent(event({ reason: 7 }), deps);
    const [first, second] = stored();
    expect(first?.data.reason).toBe("short");
    expect(second?.data.reason).toBe(7);
  });

  test("drops data and flags truncated when over 2 KiB", () => {
    appendEvent(event({ blob: "y".repeat(3000) }), deps);
    const [parsed] = stored();
    expect(parsed?.data).toEqual({});
    expect(parsed?.truncated).toBe(true);
  });

  test("measures the 2 KiB limit in bytes, not characters", () => {
    appendEvent(event({ blob: "é".repeat(1100) }), deps);
    const [parsed] = stored();
    expect(parsed?.truncated).toBe(true);
    expect(parsed?.data).toEqual({});
  });

  test("writes nothing when even the truncated line is over the limit", () => {
    appendEvent({ ...event(), repo: "r".repeat(3000) }, deps);
    expect(existsSync(path.join(directory, "events.jsonl"))).toBe(false);
  });

  test("two processes appending at once leave only valid lines", async () => {
    const script = [
      'import { appendEvent } from "' + path.resolve(import.meta.dir, "journal.ts") + '";',
      'for (let index = 0; index < 150; index += 1) appendEvent({ kind: "cleanup", repo: "r", origin: "auto", data: { index } });',
    ].join("\n");
    const children = [0, 1].map(() =>
      Bun.spawn(["bun", "-e", script], {
        env: { ...process.env, EMET_STATE_DIR: root },
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    await Promise.all(children.map((child) => child.exited));
    const { events, skippedLines } = readJournalSegments({ directory: path.join(root, "journal") });
    expect(skippedLines).toBe(0);
    expect(events).toHaveLength(300);
  });

  test("does not throw when the directory is not writable", () => {
    const blocker = path.join(root, "file");
    writeFileSync(blocker, "");
    expect(() => {
      appendEvent(event(), { directory: path.join(blocker, "journal") });
    }).not.toThrow();
  });
});

describe("rotation", () => {
  const small: JournalDeps = { rotateAtBytes: 10 };

  test("renames the current file to events.1.jsonl and starts a fresh one", () => {
    deps = { ...deps, ...small };
    appendEvent(event({ n: 1 }), deps);
    appendEvent(event({ n: 2 }), deps);
    expect(existsSync(path.join(directory, "events.1.jsonl"))).toBe(true);
    expect(currentLines()).toHaveLength(1);
    expect(stored().at(-1)?.data.n).toBe(2);
    expect(existsSync(path.join(directory, "rotate.lock"))).toBe(false);
  });

  test("shifts older segments and deletes the oldest past five", () => {
    deps = { ...deps, ...small };
    for (let n = 1; n <= 8; n += 1) appendEvent(event({ n }), deps);
    for (let number = 1; number <= 5; number += 1) {
      expect(existsSync(path.join(directory, `events.${number}.jsonl`))).toBe(true);
    }
    expect(existsSync(path.join(directory, "events.6.jsonl"))).toBe(false);
    const { events } = readJournalSegments(deps);
    expect(events.map((each) => each.data.n)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  test("appends anyway when another process holds the lock", () => {
    deps = { ...deps, ...small };
    appendEvent(event({ n: 1 }), deps);
    mkdirSync(path.join(directory, "rotate.lock"));
    writeFileSync(path.join(directory, "rotate.lock", "holder.json"), "{}");
    appendEvent(event({ n: 2 }), deps);
    expect(existsSync(path.join(directory, "events.1.jsonl"))).toBe(false);
    expect(currentLines()).toHaveLength(2);
  });

  test("does not rotate a file another process already rotated", () => {
    mkdirSync(directory, { recursive: true });
    const current = path.join(directory, "events.jsonl");
    writeFileSync(current, "x".repeat(200));
    const tight = { ...deps, rotateAtBytes: 100, keepSegments: 5 };
    rotateIfNeeded(tight);
    writeFileSync(current, "fresh\n");
    rotateIfNeeded(tight);
    expect(readFileSync(current, "utf8")).toBe("fresh\n");
    expect(existsSync(path.join(directory, "events.2.jsonl"))).toBe(false);
  });

  test("removes a stale lock and rotates", () => {
    deps = { ...deps, ...small };
    appendEvent(event({ n: 1 }), deps);
    const lock = path.join(directory, "rotate.lock");
    mkdirSync(lock);
    writeFileSync(path.join(lock, "holder.json"), "{}");
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(lock, old, old);
    rotateIfNeeded(deps);
    expect(existsSync(path.join(directory, "events.1.jsonl"))).toBe(true);
  });

  test("does nothing when the file is missing or small", () => {
    rotateIfNeeded(deps);
    appendEvent(event(), deps);
    rotateIfNeeded(deps);
    expect(existsSync(path.join(directory, "events.1.jsonl"))).toBe(false);
  });

  test("never throws when the lock cannot be taken", () => {
    deps = { ...deps, ...small };
    appendEvent(event({ n: 1 }), deps);
    writeFileSync(path.join(directory, "rotate.lock"), "not a directory");
    expect(() => {
      rotateIfNeeded(deps);
    }).not.toThrow();
    expect(existsSync(path.join(directory, "events.1.jsonl"))).toBe(false);
  });

  test("never throws on a broken directory", () => {
    expect(() => {
      rotateIfNeeded({ directory: path.join(root, "missing", "x"), rotateAtBytes: 0 });
    }).not.toThrow();
  });
});

describe("readJournalSegments", () => {
  test("is empty for a missing journal", () => {
    expect(readJournalSegments(deps)).toEqual({ events: [], skippedLines: 0 });
  });

  test("counts unparseable and invalid lines", () => {
    appendEvent(event(), deps);
    const file = path.join(directory, "events.jsonl");
    const good = readFileSync(file, "utf8");
    writeFileSync(file, `${good}\n{"v":1,"kind":"run.sta\n[1]\n{"v":2}\nnull\n`);
    const result = readJournalSegments(deps);
    expect(result.events).toHaveLength(1);
    expect(result.skippedLines).toBe(4);
  });
});

describe("readRecentEvents", () => {
  test("accepts the session.attention kind", () => {
    appendEvent({ ...event({ sessionId: "s1" }), kind: "session.attention" }, deps);
    expect(stored().map((entry) => entry.kind)).toEqual(["session.attention"]);
  });

  test("is empty for a missing journal", () => {
    expect(readRecentEvents(1024, () => true, deps)).toEqual([]);
  });

  test("returns the matching events of the current file newest first", () => {
    for (let n = 1; n <= 4; n += 1) appendEvent(event({ n }), deps);
    const events = readRecentEvents(1024 * 1024, (line) => !line.includes('"n":2'), deps);
    expect(events.map((each) => each.data.n)).toEqual([4, 3, 1]);
  });

  test("reads only the last bytes and drops the partial first line", () => {
    for (let n = 1; n <= 3; n += 1) appendEvent(event({ n }), deps);
    const lineBytes = Buffer.byteLength(currentLines()[2] ?? "") + 1;
    const events = readRecentEvents(lineBytes + 10, () => true, deps);
    expect(events.map((each) => each.data.n)).toEqual([3]);
  });

  test("ignores rotated segments and skips invalid lines", () => {
    deps = { ...deps, rotateAtBytes: 10 };
    appendEvent(event({ n: 1 }), deps);
    appendEvent(event({ n: 2 }), deps);
    const file = path.join(directory, "events.jsonl");
    writeFileSync(file, `${readFileSync(file, "utf8")}{"v":2}\nnot json\n`);
    expect(readRecentEvents(1024, () => true, deps).map((each) => each.data.n)).toEqual([2]);
  });

  test("is empty when the journal path is not readable", () => {
    mkdirSync(path.join(directory, "events.jsonl"), { recursive: true });
    expect(readRecentEvents(1024, () => true, deps)).toEqual([]);
  });
});
