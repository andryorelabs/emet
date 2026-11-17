import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { commandOutcomes } from "./exit-codes";
import { askQuestion, listOpenQuestions, run, waitForReply, writeReply } from "./mailbox";
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

  test("sorts open questions by ticket, then by id", () => {
    askQuestion("r1", "CLA-9", "c", options());
    askQuestion("r1", "CLA-7", "a", options());
    askQuestion("r1", "CLA-7", "b", options());
    const open = listOpenQuestions("r1", options());
    expect(open.map(({ ticket, id }) => `${ticket}#${String(id)}`)).toEqual([
      "CLA-7#1",
      "CLA-7#2",
      "CLA-9#1",
    ]);
  });

  test("is empty without a mailbox", () => {
    expect(listOpenQuestions("r1", options())).toEqual([]);
  });

  test("replying twice or to a missing question fails", () => {
    askQuestion("r1", "CLA-7", "one", options());
    writeReply("r1", "CLA-7", 1, "ok", options());
    expect(() => {
      writeReply("r1", "CLA-7", 1, "again", options());
    }).toThrow(/already has a reply/);
    expect(() => {
      writeReply("r1", "CLA-7", 9, "x", options());
    }).toThrow(/does not exist/);
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
        if (!isObject(parsed) || typeof parsed.id !== "number") {
          throw new Error(`unexpected ask output: ${result.stdout}`);
        }
        return parsed.id;
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
    expect(() => {
      writeReply("r2", "CLA-7", 1, "x", options());
    }).toThrow();
    expect(() => {
      writeReply("r1", "../x", 1, "x", options());
    }).toThrow();
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

  test("a counter lock held by a live process times out after bounded retries", () => {
    const directory = path.join(runDirectory(commonDirectory, "r1"), "mailbox", "CLA-7");
    const lockDirectory = path.join(directory, ".id.lock");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(
      path.join(lockDirectory, "holder.json"),
      JSON.stringify({ pid: process.pid, worktree: directory, acquiredAt: Date.now() }),
    );
    let sleeps = 0;
    const countingSleep = (): void => {
      sleeps += 1;
    };
    expect(() => askQuestion("r1", "CLA-7", "q", { ...options(), sleep: countingSleep })).toThrow(
      /timed out waiting for the question id lock/,
    );
    expect(sleeps).toBe(200);
  });
});

function writeRaw(ticket: string, name: string, content: string): void {
  const directory = path.join(runDirectory(commonDirectory, "r1"), "mailbox", ticket);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), content);
}

describe("malformed mailbox files", () => {
  test("a question without a string body or askedAt is left out of the inbox", () => {
    writeRaw("CLA-7", "1.question.json", JSON.stringify({ id: 1 }));
    writeRaw("CLA-7", "2.question.json", JSON.stringify({ id: 2, body: "ok", askedAt: "t" }));
    expect(listOpenQuestions("r1", options()).map((question) => question.id)).toEqual([2]);
  });

  test("a question file that is not a JSON object throws", () => {
    writeRaw("CLA-7", "1.question.json", "42");
    expect(() => listOpenQuestions("r1", options())).toThrow(/is not a JSON object/);
  });

  test("a reply without a string body throws instead of returning", () => {
    askQuestion("r1", "CLA-7", "q", options());
    writeRaw("CLA-7", "1.reply.json", JSON.stringify({ id: 1 }));
    expect(() => waitForReply("r1", "CLA-7", 1, 1, 30, options())).toThrow(/no string body/);
  });

  test("waiting on a missing question or an invalid id fails", () => {
    expect(() => waitForReply("r1", "CLA-7", 1, 1, 30, options())).toThrow(/does not exist/);
    expect(() => waitForReply("r1", "CLA-7", 0, 1, 30, options())).toThrow(/invalid question id/);
    expect(() => {
      writeReply("r1", "CLA-7", 1.5, "x", options());
    }).toThrow(/invalid question id/);
  });

  test("ids ignore files that are not questions", () => {
    writeRaw("CLA-7", "notes.txt", "x");
    writeRaw("CLA-7", "3.reply.json", "{}");
    expect(askQuestion("r1", "CLA-7", "q", options())).toEqual({ id: 1 });
  });
});

describe("default seams and entry point", () => {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  let logs: string[];
  let errors: string[];
  let repo: string;

  beforeEach(() => {
    logs = [];
    errors = [];
    console.log = (...parts: unknown[]) => {
      logs.push(parts.join(" "));
    };
    console.error = (...parts: unknown[]) => {
      errors.push(parts.join(" "));
    };
    process.exitCode = 0;
    repo = realpathSync(initRepo());
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    rmSync(repo, { recursive: true, force: true });
  });

  function writeOldQuestion(): void {
    const directory = path.join(repo, ".git", ".emet", "runs", "r1", "mailbox", "CLA-7");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "1.question.json"),
      JSON.stringify({ id: 1, ticket: "CLA-7", body: "q", askedAt: "2020-01-01T00:00:00.000Z" }),
    );
  }

  test("resolves the git common dir from the working directory", () => {
    expect(askQuestion("r1", "CLA-7", "q")).toEqual({ id: 1 });
    expect(existsSync(path.join(repo, ".git", ".emet", "runs", "r1", "mailbox", "CLA-7"))).toBe(
      true,
    );
  });

  test("fails outside a git repository", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "emet-mailbox-outside-"));
    try {
      process.chdir(outside);
      expect(() => askQuestion("r1", "CLA-7", "q")).toThrow(/could not resolve the git common dir/);
    } finally {
      process.chdir(repo);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("the default sleeper waits out a fractional slice", () => {
    askQuestion("r1", "CLA-7", "q");
    const started = Date.now();
    expect(waitForReply("r1", "CLA-7", 1, 0.05, 30).status).toBe("timeout");
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
  });

  test("ask prints the new question id as JSON", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--body", "hello"]);
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(logs.join("\n"))).toEqual({ id: 1 });
  });

  test("ask without a body reports the missing flag with usage and exits 1", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("emet ask: missing --body");
    expect(errors.join("\n")).toContain("usage: emet ask");
  });

  test("ask --wait prints the reply body", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--body", "q"]);
    await run("reply", ["--run", "r1", "--ticket", "CLA-7", "--id", "1", "--body", "answer"]);
    logs.length = 0;
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--wait", "1"]);
    expect(process.exitCode).toBe(0);
    expect(logs).toEqual(["answer"]);
  });

  test("ask --wait exits 3 when the slice elapses", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--body", "q"]);
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--wait", "1", "--slice", "1"]);
    expect(process.exitCode).toBe(commandOutcomes.ask.sliceTimeout);
  });

  test("ask --wait exits 4 once the wait budget is spent", async () => {
    writeOldQuestion();
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--wait", "1"]);
    expect(process.exitCode).toBe(commandOutcomes.ask.expired);
  });

  test("ask --wait rejects a non-positive slice or id", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--wait", "1", "--slice", "0"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("--slice must be a positive integer");
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--wait", "abc"]);
    expect(errors.join("\n")).toContain("--wait must be a positive integer");
  });

  test("inbox prints the open questions as JSON", async () => {
    await run("ask", ["--run", "r1", "--ticket", "CLA-7", "--body", "q"]);
    logs.length = 0;
    await run("inbox", ["--run", "r1"]);
    const printed: unknown = JSON.parse(logs.join("\n"));
    expect(printed).toMatchObject([{ ticket: "CLA-7", id: 1, body: "q" }]);
  });

  test("reply to a missing question exits 1 with the usage", async () => {
    await run("reply", ["--run", "r1", "--ticket", "CLA-7", "--id", "4", "--body", "x"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("does not exist");
  });
});
