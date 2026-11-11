import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { gitDependencies, handoffCheckCommand, parseDispatchRecord, run } from "./verify";

let repo: string;
let baseline: string;
const originalCwd = process.cwd();

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-verify-cli-")));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(path.join(repo, "a.txt"), "a\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  baseline = git("rev-parse", "HEAD");
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(repo, { recursive: true, force: true });
  process.exitCode = 0;
});

async function invoke(argv: string[]): Promise<{ out: string[]; err: string[]; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation(
    (...args) => void out.push(args.join(" ")),
  );
  const errorSpy = spyOn(console, "error").mockImplementation(
    (...args) => void err.push(args.join(" ")),
  );
  process.exitCode = 0;
  process.chdir(repo);
  try {
    await run(argv);
    return { out, err, code: process.exitCode ?? 0 };
  } finally {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

function writeDispatch(runId: string, ticket: string, record: unknown): void {
  const directory = path.join(repo, ".emet", "runs", runId, "dispatch");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${ticket}.json`), JSON.stringify(record));
}

describe("verify run in-process", () => {
  test("exits 2 with usage without a ticket", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage");
  });

  test("exits 2 when --run has no value", async () => {
    const result = await invoke(["T-1", "--run"]);
    expect(result.code).toBe(2);
  });

  test("rejects an invalid ticket id", async () => {
    const result = await invoke(["bad id"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('invalid ticket id "bad id"');
  });

  test("rejects an invalid --run id", async () => {
    const result = await invoke(["T-1", "--run", "a b"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('invalid --run id "a b"');
  });

  test("a ticket with no dispatch record asks for --run", async () => {
    const result = await invoke(["T-1"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("no dispatch record found for T-1");
  });

  test("a ticket dispatched in several runs asks for --run", async () => {
    writeDispatch("r1", "T-1", { baseline, surfaces: [] });
    writeDispatch("r2", "T-1", { baseline, surfaces: [] });
    const result = await invoke(["T-1"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("several runs");
  });

  test("a malformed dispatch record exits 2", async () => {
    writeDispatch("r1", "T-1", { baseline: 1 });
    const result = await invoke(["T-1"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("dispatch record needs");
  });

  test("a ticket with no commits beyond baseline fails verification and records it", async () => {
    writeDispatch("r1", "T-1", { baseline, surfaces: ["src/**"] });
    const result = await invoke(["T-1", "--worktree", repo]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({ ok: false });
    expect(result.out[0]).toContain('"name":"commits","ok":false');
    const saved: unknown = JSON.parse(
      readFileSync(path.join(repo, ".emet", "runs", "r1", "verify", "T-1.json"), "utf8"),
    );
    expect(saved).toMatchObject({ ticket: "T-1" });
  });

  test("the baseline config's workerScopedSuite runs and a passing one is reported", async () => {
    writeFileSync(
      path.join(repo, "emet.config.json"),
      JSON.stringify({ commands: { workerScopedSuite: "exit 0" } }),
    );
    git("add", "-A");
    git("commit", "-q", "-m", "config");
    const configBaseline = git("rev-parse", "HEAD");
    writeDispatch("r1", "T-2", { baseline: configBaseline, surfaces: [] });
    const result = await invoke(["T-2", "--run", "r1"]);
    expect(result.out[0]).toContain('"name":"suite","ok":true,"detail":"`exit 0` passed"');
  });
});

describe("verify helpers", () => {
  test("parseDispatchRecord accepts a well-formed record", () => {
    expect(parseDispatchRecord({ baseline: "abc", surfaces: ["a/**"] })).toEqual({
      baseline: "abc",
      surfaces: ["a/**"],
    });
  });

  test("parseDispatchRecord rejects non-string surfaces and non-objects", () => {
    expect(() => parseDispatchRecord({ baseline: "abc", surfaces: [1] })).toThrow(
      "dispatch record needs",
    );
    expect(() => parseDispatchRecord(null)).toThrow("dispatch record needs");
  });

  test("handoffCheckCommand uses the executable alone when compiled", () => {
    expect(handoffCheckCommand("h.md", true)).toEqual([
      process.execPath,
      "handoff",
      "--check",
      "h.md",
    ]);
  });

  test("handoffCheckCommand points at the source entry when not compiled", () => {
    const command = handoffCheckCommand("h.md", false);
    expect(command[1]).toEndWith(path.join("bin", "emet.ts"));
    expect(command.slice(2)).toEqual(["handoff", "--check", "h.md"]);
  });

  test("gitDependencies reads head, commit count and changed paths from git", async () => {
    writeFileSync(path.join(repo, "b.txt"), "b\n");
    git("add", "-A");
    git("commit", "-q", "-m", "second");
    const dependencies = gitDependencies(repo, "h.md", undefined);
    expect(await dependencies.head()).toBe(git("rev-parse", "HEAD"));
    expect(await dependencies.commitCount(baseline)).toBe(1);
    expect(await dependencies.changedPaths(baseline)).toEqual(["b.txt"]);
    expect(await dependencies.head()).toHaveLength(40);
  });

  test("gitDependencies surfaces a failing git command as an error", async () => {
    const dependencies = gitDependencies(repo, "h.md", undefined);
    const outcome = await dependencies
      .commitCount("nonexistent-ref")
      .catch((error: unknown) => error);
    expect(String(outcome)).toContain("failed");
  });
});
