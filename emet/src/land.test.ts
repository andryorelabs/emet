import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { land, parseLandArguments, run } from "./land";

let repo = "";

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function commitFile(cwd: string, name: string, content: string, message: string): void {
  writeFileSync(path.join(cwd, name), content);
  git(cwd, "add", name);
  git(cwd, "commit", "-q", "-m", message);
}

function writeConfig(config: unknown): void {
  writeFileSync(path.join(repo, "forge.config.json"), JSON.stringify(config));
  git(repo, "add", "forge.config.json");
  git(repo, "commit", "-q", "-m", "config");
}

function setUpIntegrationBranch(): void {
  git(repo, "checkout", "-q", "-b", "wave-1");
  commitFile(repo, "a.txt", "a\n", "work a");
  commitFile(repo, "b.txt", "b\n", "work b");
  git(repo, "checkout", "-q", "main");
}

async function refusalOf(): Promise<string> {
  try {
    await land({ ...baseOptions, cwd: repo });
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

const baseOptions = {
  spec: "demo",
  branch: "wave-1",
  tickets: ["demo-01", "demo-02"],
  summary: "add things",
  wave: 1,
} as const;

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-land-")));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "commit.gpgsign", "false");
  commitFile(repo, "README.md", "hi\n", "init");
  writeConfig({ landing: { mode: "merge" } });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("land", () => {
  test("squash lands one commit listing every ticket and returns the new trunk sha", async () => {
    setUpIntegrationBranch();
    const before = git(repo, "rev-parse", "main");
    const result = await land({ ...baseOptions, cwd: repo });
    expect(result.trunk).toBe(git(repo, "rev-parse", "main"));
    expect(result.tickets).toEqual(["demo-01", "demo-02"]);
    expect(git(repo, "rev-list", "--count", `${before}..main`)).toBe("1");
    expect(git(repo, "log", "-1", "--format=%s", "main")).toBe("feat: add things (wave 1 of demo)");
    const body = git(repo, "log", "-1", "--format=%b", "main");
    expect(body).toContain("- demo-01");
    expect(body).toContain("- demo-02");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  test("lands from a linked worktree into the main worktree", async () => {
    setUpIntegrationBranch();
    const linked = path.join(repo, "linked");
    git(repo, "worktree", "add", "-q", "-b", "other", linked);
    const result = await land({ ...baseOptions, cwd: linked });
    expect(result.trunk).toBe(git(repo, "rev-parse", "main"));
    expect(git(repo, "show", "main:a.txt")).toBe("a");
  });

  test("merge method creates a merge commit", async () => {
    writeConfig({ landing: { mode: "merge" }, pr: { mergeMethod: "merge" } });
    setUpIntegrationBranch();
    await land({ ...baseOptions, cwd: repo });
    expect(git(repo, "rev-list", "--parents", "-1", "main").split(" ")).toHaveLength(3);
  });

  test("refuses with an uncommitted change and leaves trunk untouched", async () => {
    setUpIntegrationBranch();
    writeFileSync(path.join(repo, "README.md"), "dirty\n");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("main worktree is not clean");
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });

  test("refuses on a detached HEAD", async () => {
    setUpIntegrationBranch();
    git(repo, "checkout", "-q", "--detach");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("detached HEAD");
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });

  test("refuses when the main worktree is on a non-trunk branch", async () => {
    setUpIntegrationBranch();
    git(repo, "checkout", "-q", "-b", "feature");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("is on feature, not main");
    expect(git(repo, "rev-parse", "main")).toBe(before);
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
  });

  test("refuses on a merge conflict and leaves trunk and the tree untouched", async () => {
    git(repo, "checkout", "-q", "-b", "wave-1");
    commitFile(repo, "README.md", "from branch\n", "branch edit");
    git(repo, "checkout", "-q", "main");
    commitFile(repo, "README.md", "from trunk\n", "trunk edit");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("merge conflict");
    expect(git(repo, "rev-parse", "main")).toBe(before);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  test("refuses when the integration branch is missing", async () => {
    expect(await refusalOf()).toContain("does not exist");
  });

  test("refuses when the branch is already merged", async () => {
    setUpIntegrationBranch();
    git(repo, "merge", "-q", "--ff-only", "wave-1");
    expect(await refusalOf()).toContain("already merged");
  });

  test("refuses in pr landing mode", async () => {
    writeConfig({ landing: { mode: "pr" } });
    setUpIntegrationBranch();
    expect(await refusalOf()).toContain("landing.mode");
  });

  test("refuses and leaves the branch unmerged when pr.autoMerge is off", async () => {
    writeConfig({ landing: { mode: "merge" }, pr: { autoMerge: false } });
    setUpIntegrationBranch();
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("autoMerge");
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });
});

describe("parseLandArguments", () => {
  test("parses flags and splits tickets", () => {
    expect(
      parseLandArguments([
        "--spec",
        "s",
        "--branch",
        "b",
        "--tickets",
        "s-01, s-02",
        "--wave",
        "2",
      ]),
    ).toEqual({ spec: "s", branch: "b", tickets: ["s-01", "s-02"], wave: 2 });
  });

  test("missing flag throws", () => {
    expect(() => parseLandArguments(["--spec", "s", "--branch", "b"])).toThrow("--tickets");
  });
});

describe("run", () => {
  test("exit code 2 on usage error, 1 on refusal", async () => {
    const original = process.cwd();
    const previousExit = process.exitCode;
    try {
      process.chdir(repo);
      await run(["--spec", "s"]);
      expect(process.exitCode).toBe(2);
      await run(["--spec", "s", "--branch", "nope", "--tickets", "s-01"]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(original);
      process.exitCode = previousExit ?? 0;
    }
  });
});
