import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { askQuestion, listOpenQuestions, waitForReply, writeReply } from "./mailbox";
import { isObject } from "./narrow";
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

const EMET_BIN = path.resolve(import.meta.dir, "../bin/emet.ts");

function initRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "emet-mailbox-repo-"));
  const result = spawnSync("git", ["init", "-q", repo]);
  if (result.status !== 0) throw new Error("git init failed");
  return repo;
}

async function runEmet(repo: string, args: readonly string[]) {
  const child = Bun.spawn([process.execPath, EMET_BIN, ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return { stdout: stdout.trim(), exitCode };
}

describe("concurrency", () => {
  test("concurrent asks for one ticket never reuse an id", async () => {
    const repo = initRepo();
    try {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          runEmet(repo, ["ask", "--run", "r1", "--ticket", "CLA-7", "--body", `q${String(index)}`]),
        ),
      );
      expect(results.every((result) => result.exitCode === 0)).toBe(true);
      const ids = results.map((result) => {
        const parsed: unknown = JSON.parse(result.stdout);
        if (!isObject(parsed) || typeof parsed["id"] !== "number") {
          throw new Error(`unexpected ask output: ${result.stdout}`);
        }
        return parsed["id"];
      });
      expect(new Set(ids).size).toBe(6);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("concurrent replies to one question leave exactly one winner", async () => {
    const repo = initRepo();
    try {
      await runEmet(repo, ["ask", "--run", "r1", "--ticket", "CLA-7", "--body", "q"]);
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          runEmet(repo, [
            "reply",
            "--run",
            "r1",
            "--ticket",
            "CLA-7",
            "--id",
            "1",
            "--body",
            `a${String(index)}`,
          ]),
        ),
      );
      expect(results.filter((result) => result.exitCode === 0)).toHaveLength(1);
      expect(results.filter((result) => result.exitCode === 1)).toHaveLength(3);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("hardening", () => {
  test("a reply cannot target another run's question or a traversal ticket", () => {
    askQuestion("r1", "CLA-7", "q", options());
    expect(() => writeReply("r2", "CLA-7", 1, "x", options())).toThrow();
    expect(() => writeReply("r1", "../x", 1, "x", options())).toThrow();
  });

  test("a stale counter lock left by a dead process is reclaimed", () => {
    const directory = path.join(runDirectory(commonDirectory, "r1"), "mailbox", "CLA-7");
    const lockDirectory = path.join(directory, ".id.lock");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(
      path.join(lockDirectory, "holder.json"),
      JSON.stringify({ pid: 999_999_999, worktree: directory, acquiredAt: 0 }),
    );
    expect(askQuestion("r1", "CLA-7", "q", options())).toEqual({ id: 1 });
  });
});
