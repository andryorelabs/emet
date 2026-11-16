import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { land, parseLandArguments, run } from "./land";
import { readPhase } from "./phase";

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

describe("land edge cases", () => {
  test("rebase method fast-forwards a branch that sits on trunk", async () => {
    writeConfig({ landing: { mode: "merge" }, pr: { mergeMethod: "rebase" } });
    setUpIntegrationBranch();
    const result = await land({ ...baseOptions, cwd: repo });
    expect(result.trunk).toBe(git(repo, "rev-parse", "wave-1"));
    expect(git(repo, "rev-list", "--count", "main")).toBe("5");
  });

  test("rebase method refuses a diverged branch and restores trunk", async () => {
    writeConfig({ landing: { mode: "merge" }, pr: { mergeMethod: "rebase" } });
    setUpIntegrationBranch();
    commitFile(repo, "c.txt", "c\n", "trunk moves on");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("not a fast-forward");
    expect(git(repo, "rev-parse", "main")).toBe(before);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  test("squash refuses a branch that adds no changes and restores trunk", async () => {
    git(repo, "checkout", "-q", "-b", "wave-1");
    commitFile(repo, "a.txt", "a\n", "add a");
    git(repo, "rm", "-q", "a.txt");
    git(repo, "commit", "-q", "-m", "remove a");
    git(repo, "checkout", "-q", "main");
    const before = git(repo, "rev-parse", "main");
    expect(await refusalOf()).toContain("adds no changes");
    expect(git(repo, "rev-parse", "main")).toBe(before);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  test("uses the default type and summary when none is given", async () => {
    setUpIntegrationBranch();
    await land({ cwd: repo, spec: "demo", branch: "wave-1", tickets: ["demo-01"] });
    expect(git(repo, "log", "-1", "--format=%s", "main")).toBe("feat: land wave-1 (demo)");
  });

  test("honours an explicit commit type", async () => {
    setUpIntegrationBranch();
    await land({ ...baseOptions, cwd: repo, type: "fix" });
    expect(git(repo, "log", "-1", "--format=%s", "main")).toBe("fix: add things (wave 1 of demo)");
  });

  test("refuses outside a git repository", async () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-land-nogit-")));
    try {
      let message = "";
      try {
        await land({ ...baseOptions, cwd: outside });
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("not inside a git repository");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("parseLandArguments", () => {
  const required = ["--spec", "s", "--branch", "b", "--tickets", "s-01"];

  test("keeps summary and type when given", () => {
    expect(parseLandArguments([...required, "--summary", "sum", "--type", "fix"])).toEqual({
      spec: "s",
      branch: "b",
      tickets: ["s-01"],
      summary: "sum",
      type: "fix",
    });
  });

  test("a flag without a value is a usage error", () => {
    expect(() => parseLandArguments(["--spec", "s", "--branch", "--tickets", "x"])).toThrow(
      "--branch requires a value",
    );
    expect(() => parseLandArguments([...required, "--wave"])).toThrow("--wave requires a value");
  });

  test("an empty ticket list is a usage error", () => {
    expect(() => parseLandArguments(["--spec", "s", "--branch", "b", "--tickets", " , "])).toThrow(
      "lists no ticket",
    );
  });

  test("a non-numeric wave is a usage error", () => {
    expect(() => parseLandArguments([...required, "--wave", "x"])).toThrow(
      "--wave must be a number",
    );
  });

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

describe("run output", () => {
  test("prints usage for --help and -h without touching the exit code", async () => {
    const originalLog = console.log;
    const printed: string[] = [];
    console.log = (text: string) => void printed.push(text);
    try {
      await run(["--help"]);
      await run(["-h"]);
    } finally {
      console.log = originalLog;
    }
    expect(printed).toHaveLength(2);
    expect(printed[0]).toContain("usage: emet land");
  });

  test("an unexpected failure exits with the internal code", async () => {
    writeFileSync(path.join(repo, "forge.config.json"), "{ not json");
    git(repo, "add", "forge.config.json");
    git(repo, "commit", "-q", "-m", "break config");
    const original = process.cwd();
    const previousExit = process.exitCode;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      process.chdir(repo);
      await run(["--spec", "s", "--branch", "b", "--tickets", "s-01"]);
      expect(process.exitCode).toBe(3);
    } finally {
      console.error = originalError;
      process.chdir(original);
      process.exitCode = previousExit ?? 0;
    }
  });
});

describe("land phase file when the worktree link breaks", () => {
  test("skips the phase file but still lands and prints the result", async () => {
    setUpIntegrationBranch();
    const linked = path.join(repo, "linked");
    git(repo, "worktree", "add", "-q", "-b", "other", linked);
    const hook = path.join(repo, ".git", "hooks", "post-commit");
    writeFileSync(hook, `#!/bin/sh\nrm -f "${repo}/.git/worktrees/linked/commondir"\n`, {
      mode: 0o755,
    });
    const original = process.cwd();
    const previousExit = process.exitCode;
    const originalLog = console.log;
    const printed: string[] = [];
    console.log = (text: string) => void printed.push(text);
    try {
      process.chdir(linked);
      process.exitCode = 0;
      await run(["--spec", "demo", "--branch", "wave-1", "--tickets", "demo-01"]);
      expect(process.exitCode).toBe(0);
    } finally {
      console.log = originalLog;
      process.chdir(original);
      process.exitCode = previousExit ?? 0;
    }
    expect(JSON.parse(printed[0] ?? "{}")).toEqual({
      trunk: git(repo, "rev-parse", "main"),
      tickets: ["demo-01"],
    });
    expect(readPhase(repo)).toBeNull();
  });
});

describe("land phase file", () => {
  test("a successful land writes the landing phase", async () => {
    setUpIntegrationBranch();
    const original = process.cwd();
    const originalLog = console.log;
    console.log = () => undefined;
    try {
      process.chdir(repo);
      await run(["--spec", "demo", "--branch", "wave-1", "--tickets", "demo-01"]);
      expect(readPhase(repo)?.phase).toBe("landing");
    } finally {
      console.log = originalLog;
      process.chdir(original);
    }
  });

  test("an unwritable phase file does not change the exit code", async () => {
    setUpIntegrationBranch();
    mkdirSync(path.join(repo, ".emet", "phase.json"), { recursive: true });
    const original = process.cwd();
    const previousExit = process.exitCode;
    const originalLog = console.log;
    console.log = () => undefined;
    try {
      process.chdir(repo);
      process.exitCode = 0;
      await run(["--spec", "demo", "--branch", "wave-1", "--tickets", "demo-01"]);
      expect(process.exitCode).toBe(0);
    } finally {
      console.log = originalLog;
      process.chdir(original);
      process.exitCode = previousExit ?? 0;
    }
  });
});
