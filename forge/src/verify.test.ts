import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findOutOfSurfacePaths,
  gitDependencies,
  isBookkeepingPath,
  parseDispatchRecord,
  verifyTicket,
  type VerifyDependencies,
} from "./verify";

const dispatch = { baseline: "abcdef1234567890", surfaces: ["src/a.ts", "src/lib/**"] };

function fakeDependencies(overrides: Partial<VerifyDependencies> = {}): VerifyDependencies {
  return {
    head: async () => "headsha",
    commitCount: async () => 1,
    changedPaths: async () => ["src/a.ts", ".forge/handoff-T-1.md"],
    handoffCheck: async () => ({ exitCode: 0, output: "" }),
    workerScopedSuite: "bun test",
    runSuite: async () => ({ exitCode: 0, output: "" }),
    ...overrides,
  };
}

const failed = (record: { checks: readonly { name: string; ok: boolean }[] }) =>
  record.checks.filter((check) => !check.ok).map((check) => check.name);

describe("surface matching", () => {
  test("globs and literals", () => {
    expect(
      findOutOfSurfacePaths(["src/a.ts", "src/lib/x/y.ts", "src/b.ts"], dispatch.surfaces),
    ).toEqual(["src/b.ts"]);
  });
  test("bookkeeping paths", () => {
    expect(isBookkeepingPath(".forge/surface.json")).toBe(true);
    expect(isBookkeepingPath("src/.forge/x")).toBe(false);
  });
});

describe("verifyTicket", () => {
  test("passes when every check passes", async () => {
    const record = await verifyTicket("T-1", dispatch, fakeDependencies());
    expect(record.ok).toBe(true);
    expect(record.head).toBe("headsha");
  });

  test("fails with no commits beyond baseline", async () => {
    const record = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ commitCount: async () => 0 }),
    );
    expect(failed(record)).toEqual(["commits"]);
  });

  test("bookkeeping-only commits do not count as work", async () => {
    const record = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ changedPaths: async () => [".forge/handoff-T-1.md"] }),
    );
    expect(failed(record)).toContain("commits");
  });

  test("fails on a path outside the surfaces", async () => {
    const record = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ changedPaths: async () => ["src/a.ts", "README.md"] }),
    );
    expect(failed(record)).toEqual(["surfaces"]);
    expect(record.checks.find((c) => c.name === "surfaces")!.detail).toContain("README.md");
  });

  test("fails when handoff --check fails", async () => {
    const record = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ handoffCheck: async () => ({ exitCode: 1, output: 'missing "next:"' }) }),
    );
    expect(failed(record)).toEqual(["handoff"]);
  });

  test("fails when the suite fails, and skips when unconfigured", async () => {
    const bad = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ runSuite: async () => ({ exitCode: 1, output: "boom" }) }),
    );
    expect(failed(bad)).toEqual(["suite"]);
    const skipped = await verifyTicket(
      "T-1",
      dispatch,
      fakeDependencies({ workerScopedSuite: undefined }),
    );
    expect(skipped.ok).toBe(true);
  });
});

describe("parseDispatchRecord", () => {
  test("rejects malformed records", () => {
    expect(() => parseDispatchRecord({ baseline: 1 })).toThrow();
    expect(parseDispatchRecord(dispatch)).toEqual(dispatch);
  });
});

describe("against a real git worktree", () => {
  let repo: string;
  const git = (...args: string[]): string => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };

  beforeAll(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), "forge-verify-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    writeFileSync(path.join(repo, "seed.txt"), "seed\n");
    git("add", "-A");
    git("commit", "-q", "-m", "seed");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  test("counts commits and lists changed paths past the baseline", async () => {
    const baseline = git("rev-parse", "HEAD");
    const deps = gitDependencies(repo, path.join(repo, ".forge/handoff-T-1.md"), undefined);
    expect(await deps.commitCount(baseline)).toBe(0);
    mkdirSync(path.join(repo, "src"));
    writeFileSync(path.join(repo, "src/a.ts"), "x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "work");
    expect(await deps.commitCount(baseline)).toBe(1);
    expect(await deps.changedPaths(baseline)).toEqual(["src/a.ts"]);
    expect(await deps.head()).toBe(git("rev-parse", "HEAD"));
    expect((await deps.runSuite("exit 3")).exitCode).toBe(3);
  });

  test("CLI writes the verify record and exits 1 on failure", () => {
    const baseline = git("rev-parse", "HEAD");
    const dispatchDir = path.join(repo, ".forge/runs/r1/dispatch");
    mkdirSync(dispatchDir, { recursive: true });
    writeFileSync(
      path.join(dispatchDir, "T-1.json"),
      JSON.stringify({ baseline, surfaces: ["src/a.ts"] }),
    );
    const result = Bun.spawnSync(
      ["bun", path.join(import.meta.dir, "verify.ts"), "T-1", "--run", "r1"],
      {
        cwd: repo,
      },
    );
    expect(result.exitCode).toBe(1);
    const record = JSON.parse(
      readFileSync(path.join(repo, ".forge/runs/r1/verify/T-1.json"), "utf8"),
    );
    expect(record.ok).toBe(false);
    expect(record.checks.map((c: { name: string }) => c.name)).toEqual([
      "commits",
      "surfaces",
      "handoff",
      "suite",
    ]);
  });
});
