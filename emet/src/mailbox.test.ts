import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { askQuestion, listOpenQuestions, waitForReply, writeReply } from "./mailbox";
import { runDirectory } from "./runs";

let commonDirectory: string;
let clock: number;
const sleep = (milliseconds: number): void => {
  clock += milliseconds;
};
const options = () => ({ commonDirectory, now: () => clock, sleep });

beforeEach(() => {
  commonDirectory = mkdtempSync(path.join(tmpdir(), "emet-mailbox-"));
  clock = Date.parse("2026-01-01T00:00:00Z");
});

afterEach(() => {
  rmSync(commonDirectory, { recursive: true, force: true });
});

describe("askQuestion", () => {
  test("increments ids per ticket and writes question files", () => {
    expect(askQuestion("r1", "CLA-7", "first?", options())).toEqual({ id: 1 });
    expect(askQuestion("r1", "CLA-7", "second?", options())).toEqual({ id: 2 });
    expect(askQuestion("r1", "CLA-8", "other?", options())).toEqual({ id: 1 });
    const directory = path.join(runDirectory(commonDirectory, "r1"), "mailbox", "CLA-7");
    expect(existsSync(path.join(directory, "1.question.json"))).toBe(true);
    expect(existsSync(path.join(directory, "2.question.json"))).toBe(true);
  });

  test("rejects unsafe ticket ids", () => {
    expect(() => askQuestion("r1", "../x", "b", options())).toThrow();
  });
});

describe("waitForReply", () => {
  test("times out within the slice while the question is young", () => {
    askQuestion("r1", "CLA-7", "q", options());
    clock += 5 * 60_000;
    expect(waitForReply("r1", "CLA-7", 1, 1, 30, options()).status).toBe("timeout");
  });

  test("expires once the question outlives the budget", () => {
    askQuestion("r1", "CLA-7", "q", options());
    clock += 31 * 60_000;
    expect(waitForReply("r1", "CLA-7", 1, 1, 30, options()).status).toBe("expired");
  });

  test("returns the reply body", () => {
    askQuestion("r1", "CLA-7", "q", options());
    writeReply("r1", "CLA-7", 1, "use shape A", options());
    expect(waitForReply("r1", "CLA-7", 1, 1, 30, options())).toEqual({
      status: "reply",
      body: "use shape A",
    });
  });

  test("picks up a reply that lands during the slice", () => {
    askQuestion("r1", "CLA-7", "q", options());
    let calls = 0;
    const lateSleep = (milliseconds: number): void => {
      clock += milliseconds;
      calls += 1;
      if (calls === 2) writeReply("r1", "CLA-7", 1, "late", options());
    };
    const result = waitForReply("r1", "CLA-7", 1, 10, 30, { ...options(), sleep: lateSleep });
    expect(result).toEqual({ status: "reply", body: "late" });
  });
});

describe("inbox and reply", () => {
  test("lists only open questions", () => {
    askQuestion("r1", "CLA-7", "one", options());
    askQuestion("r1", "CLA-7", "two", options());
    writeReply("r1", "CLA-7", 1, "ok", options());
    const open = listOpenQuestions("r1", options());
    expect(open.map(({ ticket, id, body }) => ({ ticket, id, body }))).toEqual([
      { ticket: "CLA-7", id: 2, body: "two" },
    ]);
    expect(open[0]?.askedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("is empty without a mailbox", () => {
    expect(listOpenQuestions("r1", options())).toEqual([]);
  });

  test("replying twice or to a missing question fails", () => {
    askQuestion("r1", "CLA-7", "one", options());
    writeReply("r1", "CLA-7", 1, "ok", options());
    expect(() => writeReply("r1", "CLA-7", 1, "again", options())).toThrow(/already has a reply/);
    expect(() => writeReply("r1", "CLA-7", 9, "x", options())).toThrow(/does not exist/);
  });
});
