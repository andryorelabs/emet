import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setDefaultTimeout,
  spyOn,
  test,
} from "bun:test";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./preflight";
import { markRunClosed } from "./runs";
import { acquireSlot } from "./slots";

const IMPOSSIBLE_PID = 999_999_999;

setDefaultTimeout(60_000);

function runGit(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  }).trim();
}

interface Fixture {
  repo: string;
  stateDir: string;
  home: string;
  logs: string[];
  errors: string[];
  spawned: ReturnType<typeof Bun.spawn>[];
  claudePid: () => number;
  writeConfig: (config: Record<string, unknown>) => void;
  addWorktree: (name: string, branch: string, lockReason?: string) => string;
  lockReason: (runId: string, ticket: string, anchor: number, slug?: string) => string;
}

function useFixture(): Fixture {
  const fixture: Fixture = {
    repo: "",
    stateDir: "",
    home: "",
    logs: [],
    errors: [],
    spawned: [],
    claudePid: () => {
      const binDirectory = path.join(fixture.home, "bin");
      mkdirSync(binDirectory, { recursive: true });
      const link = path.join(binDirectory, "claude");
      if (!existsSync(link)) copyFileSync("/usr/bin/bash", link);
      const child = Bun.spawn([link, "-c", "while :; do sleep 1; done"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      fixture.spawned.push(child);
      return child.pid;
    },
    writeConfig: (config) => {
      writeFileSync(
        path.join(fixture.repo, "emet.config.json"),
        JSON.stringify({ version: 1, landing: { mode: "merge" }, ...config }),
      );
    },
    addWorktree: (name, branch, lockReason) => {
      const directory = path.join(fixture.repo, ".claude", "worktrees", `agent-${name}`);
      runGit(fixture.repo, "worktree", "add", "-q", "-b", branch, directory, "main");
      if (lockReason !== undefined)
        runGit(fixture.repo, "worktree", "lock", "--reason", lockReason, directory);
      return directory;
    },
    lockReason: (runId, ticket, anchor, slug = "coordinator-slug") =>
      `emet run=${runId} ticket=${ticket} anchor=${anchor} slug=${slug} at=2026-01-01T00:00:00.000Z`,
  };
  const originalCwd = process.cwd();
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fixture.repo = realpathSync(mkdtempSync(path.join(tmpdir(), "preflight-run-")));
    fixture.stateDir = mkdtempSync(path.join(tmpdir(), "preflight-state-"));
    fixture.home = mkdtempSync(path.join(tmpdir(), "preflight-home-"));
    fixture.logs = [];
    fixture.errors = [];
    fixture.spawned = [];
    runGit(fixture.repo, "init", "-q", "-b", "main");
    fixture.writeConfig({});
    runGit(fixture.repo, "add", "-A");
    runGit(fixture.repo, "commit", "-q", "-m", "init");
    process.chdir(fixture.repo);
    process.env.EMET_STATE_DIR = fixture.stateDir;
    process.env.EMET_SKIP_DEPENDENCY_CHECKS = "1";
    process.env.HOME = fixture.home;
    Reflect.deleteProperty(process.env, "EMET_MAX_LIVE_WORKERS");
    process.exitCode = 0;
    spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      fixture.logs.push(parts.join(" "));
    });
    spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      fixture.errors.push(parts.join(" "));
    });
  });

  afterEach(() => {
    mock.restore();
    for (const child of fixture.spawned) child.kill();
    process.chdir(originalCwd);
    process.argv = originalArgv;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) Reflect.deleteProperty(process.env, key);
    }
    Object.assign(process.env, originalEnv);
    process.exitCode = 0;
    rmSync(fixture.repo, { recursive: true, force: true });
    rmSync(fixture.stateDir, { recursive: true, force: true });
    rmSync(fixture.home, { recursive: true, force: true });
  });

  return fixture;
}

describe("preflight run (full gate)", () => {
  const fixture = useFixture();

  test("passes on a clean trunk checkout and reports slot and dependency counts", async () => {
    await run([]);
    expect(process.exitCode).toBe(0);
    expect(fixture.errors).toEqual([]);
    const summary = fixture.logs.join("\n");
    expect(summary).toContain("emet preflight OK — no required files configured");
    expect(summary).toContain("16/16 worker slots free");
    expect(summary).toContain("codebase map is stale");
    expect(summary).toContain("declares no tracker.kind");
  });

  test("lists required files that are missing and required commands that are not on PATH", async () => {
    fixture.writeConfig({
      preflight: {
        requiredFiles: [{ path: "NEEDED.md", why: "workers read it" }],
        requiredCommands: ["definitely-not-a-real-command-545"],
      },
    });
    await run([]);
    expect(process.exitCode).toBe(1);
    const output = fixture.errors.join("\n");
    expect(output).toContain("NEEDED.md is missing at the repo root — workers read it");
    expect(output).toContain(
      "preflight.requiredCommands not on PATH: definitely-not-a-real-command-545.",
    );
  });

  test("summarises present required files on success", async () => {
    writeFileSync(path.join(fixture.repo, "NEEDED.md"), "x");
    runGit(fixture.repo, "add", "-A");
    runGit(fixture.repo, "commit", "-q", "-m", "needed");
    fixture.writeConfig({
      preflight: { requiredFiles: [{ path: "NEEDED.md", why: "w" }], requiredCommands: [] },
    });
    runGit(fixture.repo, "commit", "-q", "-am", "config");
    await run([]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("NEEDED.md present");
  });

  test("fails the gate for an unknown --approval run", async () => {
    await run(["--approval", "no-such-run"]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("approval:");
  });

  test("fails when docs/agents still carries a TODO marker", async () => {
    mkdirSync(path.join(fixture.repo, "docs", "agents"), { recursive: true });
    writeFileSync(path.join(fixture.repo, "docs", "agents", "emet.md"), "TODO(forge): fill in\n");
    runGit(fixture.repo, "add", "-A");
    runGit(fixture.repo, "commit", "-q", "-m", "docs");
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("docs/agents/ still has 1");
  });

  test("fails when HEAD is not trunk or a descendant of it", async () => {
    runGit(fixture.repo, "checkout", "-q", "--orphan", "elsewhere");
    runGit(fixture.repo, "commit", "-q", "--allow-empty", "-m", "unrelated");
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("HEAD (elsewhere) is not main");
  });

  test("fails when Phase 5 records are untracked on trunk", async () => {
    writeFileSync(path.join(fixture.repo, "GLOSSARY.md"), "# terms\n");
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("Phase 5 records are not on main: GLOSSARY.md");
  });

  test("warns about an orphaned worktree-agent scaffold branch without failing", async () => {
    runGit(fixture.repo, "branch", "worktree-agent-gone");
    await run([]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("Orphaned worktree-agent-* scaffold branches");
    expect(fixture.logs.join("\n")).toContain("worktree-agent-gone");
  });

  test("fails with a clear message when every worker slot is held by a live run", async () => {
    fixture.writeConfig({ concurrency: { maxLiveWorkers: 1 } });
    runGit(fixture.repo, "commit", "-q", "-am", "config");
    const anchor = fixture.claudePid();
    expect(await acquireSlot(1, "holder-run", anchor, "CLA-1")).toBe(0);
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("No free worker slots at all: 0 free out of 1");
  });

  test("warns when fewer slots are free than a wave needs", async () => {
    fixture.writeConfig({ concurrency: { maxLiveWorkers: 2, waveSize: 4 } });
    runGit(fixture.repo, "commit", "-q", "-am", "config");
    const anchor = fixture.claudePid();
    expect(await acquireSlot(2, "holder-run", anchor, "CLA-1")).toBe(0);
    await run([]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain(
      "only 1/2 worker slot(s) free — this wave can dispatch at most 1 of its usual 4",
    );
    expect(fixture.logs.join("\n")).toContain("1/2 worker slots free");
  });

  test("blocks dispatch on an unusable tracker dependency unless skipped", async () => {
    fixture.writeConfig({ tracker: { kind: "github" } });
    runGit(fixture.repo, "commit", "-q", "-am", "config");
    Reflect.deleteProperty(process.env, "EMET_SKIP_DEPENDENCY_CHECKS");
    const gitOnly = path.join(fixture.home, "git-only");
    mkdirSync(gitOnly, { recursive: true });
    symlinkSync(realpathSync("/usr/bin/git"), path.join(gitOnly, "git"));
    process.env.PATH = gitOnly;
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("gh CLI not found on PATH");
  });
});

describe("preflight run (worktree entries)", () => {
  const fixture = useFixture();

  test("classifies every worktree shape into the right bucket", async () => {
    const deadReason = fixture.lockReason("run-dead", "CLA-1", IMPOSSIBLE_PID);
    fixture.addWorktree("dead", "worktree-agent-dead", deadReason);

    const anchor = fixture.claudePid();
    fixture.addWorktree(
      "live",
      "worktree-agent-live",
      fixture.lockReason("run-live", "CLA-3", anchor),
    );

    fixture.addWorktree(
      "closed",
      "worktree-agent-closed",
      fixture.lockReason("run-closed", "CLA-4", anchor),
    );
    await markRunClosed("run-closed");

    const detached = path.join(fixture.repo, ".claude", "worktrees", "agent-detached");
    runGit(fixture.repo, "worktree", "add", "-q", "--detach", detached, "main");

    fixture.addWorktree("foreign", "feature-foreign");
    fixture.addWorktree("unowned", "ticket-9-unowned");

    await run(["--run", "run-me"]);

    const output = [...fixture.logs, ...fixture.errors].join("\n");
    expect(output).toContain("agent-dead (worktree-agent-dead): dead — reclaimable");
    expect(output).toContain("agent-live (worktree-agent-live): live — owned by run run-live");
    expect(output).toContain("agent-closed (worktree-agent-closed): closed — run run-closed");
    expect(output).toContain("agent-foreign (feature-foreign): foreign worktree");
    expect(output).toContain("agent-unowned (ticket-9-unowned): ");
    expect(output).toContain("agent-detached: detached, no branch");
    expect(process.exitCode).toBe(1);
  });

  test("fails on this run's own live leftover and names the cleanup command", async () => {
    const anchor = fixture.claudePid();
    fixture.addWorktree(
      "mine",
      "worktree-agent-mine",
      fixture.lockReason("run-me", "CLA-5", anchor),
    );
    await run(["--run", "run-me"]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain('run "emet cleanup --run run-me" to clear it');
  });

  test("reports a landed-clean unowned worktree as safe to clean", async () => {
    fixture.addWorktree("merged", "ticket-12-merged");
    await run([]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("agent-merged (ticket-12-merged)");
  });
});

describe("preflight run (failure exits)", () => {
  const fixture = useFixture();

  test("exits 2 outside a git repository", async () => {
    const outside = realpathSync(mkdtempSync(path.join(tmpdir(), "preflight-outside-")));
    process.chdir(outside);
    try {
      await run([]);
    } finally {
      process.chdir(fixture.repo);
      rmSync(outside, { recursive: true, force: true });
    }
    expect(process.exitCode).toBe(2);
    expect(fixture.errors.join("\n")).toContain("not inside a git repository");
  });

  test("exits 2 when emet.config.json is missing", async () => {
    rmSync(path.join(fixture.repo, "emet.config.json"));
    await run([]);
    expect(process.exitCode).toBe(2);
    expect(fixture.errors.join("\n")).toContain("emet init");
  });

  test("exits 1 and prints the error for an unexpected failure", async () => {
    const blocker = path.join(fixture.stateDir, "not-a-directory");
    writeFileSync(blocker, "file");
    process.env.EMET_STATE_DIR = blocker;
    await run([]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors).toHaveLength(1);
    expect(String(fixture.errors[0])).toMatch(/ENOTDIR|EEXIST|not a directory/i);
  });
});

describe("preflight run --post-dispatch", () => {
  const fixture = useFixture();

  test("without --run passes on a clean repo and says it is not scoped", async () => {
    await run(["--post-dispatch"]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("no --run given, so not scoped to any one dispatch");
  });

  test("without --run fails on an unlocked agent worktree past the deadline", async () => {
    const directory = fixture.addWorktree("stray", "worktree-agent-stray");
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(directory, old, old);
    await run(["--post-dispatch"]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("emet preflight --post-dispatch failed");
  });

  test("with --run and no expectation data flags the lack of data when worktrees exist", async () => {
    const anchor = fixture.claudePid();
    fixture.addWorktree(
      "other",
      "ticket-7-other",
      fixture.lockReason("run-other", "CLA-7", anchor),
    );
    await run(["--post-dispatch", "--run", "run-me"]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("0 of run run-me's worktree(s) were attributed");
  });

  test("with --run reports the checked count when this run's worktrees are present", async () => {
    const anchor = fixture.claudePid();
    fixture.addWorktree("mine", "ticket-8-mine", fixture.lockReason("run-me", "CLA-8", anchor));
    await run(["--post-dispatch", "--run", "run-me", "--expect", "1"]);
    expect(process.exitCode).toBe(0);
    expect(fixture.logs.join("\n")).toContain("1 of run run-me's worktree(s) checked");
  });

  test("fails when --expect exceeds the attributed worktrees and no candidate exists", async () => {
    await run(["--post-dispatch", "--run", "run-me", "--expect", "2"]);
    expect(process.exitCode).toBe(1);
    const output = fixture.errors.join("\n");
    expect(output).toContain("Expected 2 locked worktree(s) for run run-me");
    expect(output).toContain("No unlocked candidate worktrees were found either");
  });

  test("names the unlocked candidate past the deadline when a worktree is missing", async () => {
    const directory = fixture.addWorktree("stray", "worktree-agent-stray");
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(directory, old, old);
    await run(["--post-dispatch", "--run", "run-me", "--expect", "1"]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("may be the missing one(s)");
  });

  test("fails when a worktree's branch does not match its own lock's ticket", async () => {
    const anchor = fixture.claudePid();
    fixture.addWorktree(
      "wrong",
      "worktree-agent-wrong",
      fixture.lockReason("run-me", "CLA-6", anchor),
    );
    await run(["--post-dispatch", "--run", "run-me"]);
    expect(process.exitCode).toBe(1);
    expect(fixture.errors.join("\n")).toContain("but its own lock names ticket CLA-6");
  });

  test("derives the expected tickets from this run's slot holdings", async () => {
    const anchor = fixture.claudePid();
    expect(await acquireSlot(4, "run-me", anchor, "CLA-9")).toBe(0);
    await run(["--post-dispatch", "--run", "run-me"]);
    expect(process.exitCode).toBe(1);
    const output = fixture.errors.join("\n");
    expect(output).toContain("(tickets: CLA-9; missing: CLA-9)");
    expect(output).toContain("Expected 1 locked worktree(s) for run run-me");
  });
});
