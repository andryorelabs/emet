import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { reclaimDeadWorktree, run as runCleanup } from "./cleanup";
import { markRunClosed } from "./runs";
import { acquireSlot } from "./slots";

const DEAD_ANCHOR_PID = 4194300;

function touchTranscript(slug: string, runId: string): void {
  const directory = path.join(os.homedir(), ".claude", "projects", slug);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${runId}.jsonl`), "{}\n");
}

interface LogSpy {
  mockRestore: () => void;
  mockClear: () => void;
  mock: { calls: unknown[][] };
}

describe("cleanup run against a real repository", () => {
  const originalDirectory = process.cwd();
  const originalStateDirectory = process.env.EMET_STATE_DIR;
  const transcriptSlug = `-cleanup-sweep-test-${process.pid}`;
  let repo: string;
  let stateDirectory: string;
  let fakeHome: string;
  let homedirSpy: LogSpy;
  let logSpy: LogSpy;
  let errorSpy: LogSpy;

  async function git(...args: string[]): Promise<string> {
    const result = await Bun.$`git ${args}`.cwd(repo).quiet();
    return result.stdout.toString().trim();
  }

  async function branchNames(): Promise<string[]> {
    const listing = await git("branch", "--format=%(refname:short)");
    return listing.split("\n").filter((name) => name.length > 0);
  }

  function output(): string {
    return logSpy.mock.calls.map((call) => String(call[0])).join("\n");
  }

  function errors(): string {
    return errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
  }

  async function branchWithUnmergedCommit(branch: string): Promise<void> {
    const scratch = path.join(repo, "scratch");
    await git("worktree", "add", "-q", "-b", branch, scratch, "main");
    writeFileSync(path.join(scratch, "file.txt"), `unmerged ${branch}\n`);
    await git("-C", scratch, "commit", "-q", "-am", `work on ${branch}`);
    await git("worktree", "remove", scratch);
  }

  function ownedLock(runId: string, ticket: string, slug = transcriptSlug): string {
    return `emet run=${runId} ticket=${ticket} anchor=${DEAD_ANCHOR_PID} slug=${slug} at=2026-09-07T00:00:00Z`;
  }

  async function addOwnedWorktree(
    agentId: string,
    branch: string,
    runId: string,
    ticket: string,
  ): Promise<string> {
    const directory = path.join(repo, ".claude", "worktrees", agentId);
    await git("worktree", "add", "-q", "-b", branch, directory, "main");
    await git("worktree", "lock", directory, "--reason", ownedLock(runId, ticket));
    return directory;
  }

  beforeEach(async () => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "cleanup-sweep-")));
    stateDirectory = mkdtempSync(path.join(os.tmpdir(), "cleanup-sweep-state-"));
    process.env.EMET_STATE_DIR = stateDirectory;
    fakeHome = mkdtempSync(path.join(os.tmpdir(), "cleanup-sweep-home-"));
    homedirSpy = spyOn(os, "homedir").mockReturnValue(fakeHome);
    await git("init", "-q", "-b", "main");
    await git("config", "user.email", "test@example.com");
    await git("config", "user.name", "Test");
    await git("config", "commit.gpgsign", "false");
    writeFileSync(
      path.join(repo, "emet.config.json"),
      JSON.stringify({ landing: { mode: "merge" }, ticket: { branchPrefix: "cla" } }),
    );
    writeFileSync(path.join(repo, "file.txt"), "base\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "base");
    mkdirSync(path.join(repo, ".claude", "worktrees"), { recursive: true });
    process.chdir(repo);
    process.exitCode = 0;
    logSpy = spyOn(console, "log").mockReturnValue(undefined);
    errorSpy = spyOn(console, "error").mockReturnValue(undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.chdir(originalDirectory);
    process.exitCode = 0;
    if (originalStateDirectory === undefined) delete process.env.EMET_STATE_DIR;
    else process.env.EMET_STATE_DIR = originalStateDirectory;
    homedirSpy.mockRestore();
    rmSync(fakeHome, { recursive: true, force: true });
    chmodSync(path.join(repo, ".claude", "worktrees"), 0o755);
    rmSync(repo, { recursive: true, force: true });
    rmSync(stateDirectory, { recursive: true, force: true });
  });

  test("--all --dry-run reports what it would delete without deleting", async () => {
    await git("branch", "worktree-agent-merged", "main");
    await git("branch", "cla-11-merged", "main");
    await branchWithUnmergedCommit("cla-12-review");

    await runCleanup(["--all", "--dry-run"]);

    expect(process.exitCode).toBe(0);
    const logged = output();
    expect(logged).toContain("explicit repo-wide sweep");
    expect(logged).toContain("(dry run)");
    expect(logged).toContain("Would delete: worktree-agent-merged");
    expect(logged).toContain("Would delete: cla-11-merged");
    expect(logged).toContain("Kept 1 branch(es) with unmerged or unresolved work");
    expect(logged).toContain("cla-12-review (diverged)");
    expect(logged).toContain("Dry run — nothing was deleted.");
    const branches = await branchNames();
    expect(branches).toContain("worktree-agent-merged");
    expect(branches).toContain("cla-11-merged");
  });

  test("--all deletes merged branches and keeps unmerged and checked-out ones", async () => {
    await git("branch", "worktree-agent-merged", "main");
    await git("branch", "cla-11-merged", "main");
    await branchWithUnmergedCommit("cla-12-review");
    const liveDirectory = path.join(repo, ".claude", "worktrees", "agent-live");
    await git("worktree", "add", "-q", "-b", "worktree-agent-live", liveDirectory, "main");

    await runCleanup(["--all"]);

    expect(process.exitCode).toBe(0);
    const logged = output();
    expect(logged).toContain("Deleted 2 branch(es):");
    expect(logged).toContain("worktree-agent-merged (merged)");
    expect(logged).toContain("Kept 1 branch(es) held by a live worktree:");
    expect(logged).toContain("  - worktree-agent-live");
    expect(logged).toContain("git worktree prune complete.");
    const branches = await branchNames();
    expect(branches).not.toContain("worktree-agent-merged");
    expect(branches).not.toContain("cla-11-merged");
    expect(branches).toContain("cla-12-review");
    expect(branches).toContain("worktree-agent-live");
    expect(existsSync(liveDirectory)).toBe(true);
  });

  test("a bare sweep dry run reports the finished-runs scope and prunes nothing", async () => {
    await git("branch", "worktree-agent-orphan", "main");

    await runCleanup(["--dry-run"]);

    expect(process.exitCode).toBe(0);
    expect(output()).toContain("closed or dead runs");
    expect(output()).toContain("Would delete 1 orphaned scaffold branch(es):");
    expect(output()).toContain("Dry run — nothing was deleted.");
    expect(await branchNames()).toContain("worktree-agent-orphan");
  });

  test("a bare sweep deletes an orphaned scaffold and reports it", async () => {
    await git("branch", "worktree-agent-orphan", "main");

    await runCleanup([]);

    expect(output()).toContain("Deleted 1 orphaned scaffold branch(es):");
    expect(await branchNames()).not.toContain("worktree-agent-orphan");
  });

  test("a --run sweep with a foreign run's worktree counts it out of scope", async () => {
    const directory = path.join(repo, ".claude", "worktrees", "agent-other");
    await git("worktree", "add", "-q", "-b", "cla-20-other", directory, "main");
    await git(
      "worktree",
      "lock",
      directory,
      "--reason",
      `emet run=run-other ticket=CLA-20 anchor=${process.pid} at=2026-09-07T00:00:00Z`,
    );

    await runCleanup(["--run", "run-mine"]);

    expect(output()).toContain("1 worktree(s) out of scope for run run-mine — not touched.");
    expect(existsSync(directory)).toBe(true);
    expect(output()).toContain("Run run-mine marked closed.");
  });

  test("a usage error exits 2 and prints the message", async () => {
    await runCleanup(["--run"]);
    expect(process.exitCode).toBe(2);
    expect(errors()).toContain("--run requires a value");
  });

  test("running outside a git repository exits 2", async () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "cleanup-outside-")));
    try {
      process.chdir(outside);
      await runCleanup([]);
      expect(process.exitCode).toBe(2);
      expect(errors()).toContain("not inside a git repository");
    } finally {
      process.chdir(repo);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("an unresolvable trunk ref is a fatal config error", async () => {
    writeFileSync(
      path.join(repo, "emet.config.json"),
      JSON.stringify({ landing: { mode: "merge" }, repo: { trunk: "nope" } }),
    );

    await runCleanup(["--all"]);

    expect(process.exitCode).toBe(2);
    expect(errors()).toContain("could not resolve nope");
  });

  test("a bare sweep reclaims closed and dead runs and protects an idle run", async () => {
    const closed = await addOwnedWorktree("agent-closed", "cla-41-closed", "run-closed", "CLA-41");
    const dead = await addOwnedWorktree("agent-dead", "cla-42-dead", "run-dead", "CLA-42");
    const idle = await addOwnedWorktree("agent-idle", "cla-43-idle", "run-idle", "CLA-43");
    await markRunClosed("run-closed");
    touchTranscript(transcriptSlug, "run-idle");

    await runCleanup([]);

    expect(existsSync(closed)).toBe(false);
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(idle)).toBe(true);
    const logged = output();
    expect(logged).toContain("Reclaimed 2 worktree(s):");
    expect(logged).toContain("cla-43-idle (run run-idle, idle) — run is active");
    const branches = await branchNames();
    expect(branches).not.toContain("cla-41-closed");
    expect(branches).not.toContain("cla-42-dead");
    expect(branches).toContain("cla-43-idle");
  });

  test("a dead run's worktree whose branch never landed is kept and reported", async () => {
    const directory = await addOwnedWorktree("agent-open", "cla-44-open", "run-dead", "CLA-44");
    writeFileSync(path.join(directory, "file.txt"), "unmerged\n");
    await git("-C", directory, "commit", "-q", "-am", "unmerged work");

    await runCleanup([]);

    expect(existsSync(directory)).toBe(true);
    expect(output()).toContain("Kept 1 worktree(s) whose ticket has not landed:");
    expect(output()).toContain("  - cla-44-open (");
  });

  test("an unowned worktree on a non-worker branch is protected with its shape", async () => {
    const directory = path.join(repo, ".claude", "worktrees", "agent-plain");
    await git("worktree", "add", "-q", "-b", "worktree-agent-plain", directory, "main");

    await runCleanup([]);

    expect(existsSync(directory)).toBe(true);
    expect(output()).toContain("Skipped 1 worktree(s), protected:");
    expect(output()).toContain("worktree-agent-plain — no owner, ");
  });

  test("a failed worktree removal keeps its branch and fails the run", async () => {
    const directory = await addOwnedWorktree("agent-stuck", "cla-45-stuck", "run-dead", "CLA-45");
    chmodSync(path.join(repo, ".claude", "worktrees"), 0o555);

    await runCleanup([]);

    expect(existsSync(directory)).toBe(true);
    expect(process.exitCode).toBe(1);
    expect(output()).toContain("Failed to reclaim 1 item(s):");
    expect(await branchNames()).toContain("cla-45-stuck");
  });

  test("a failed orphaned scaffold deletion fails the run", async () => {
    await git("branch", "worktree-agent-orphan", "main");
    writeFileSync(path.join(repo, ".git", "refs", "heads", "worktree-agent-orphan.lock"), "");

    await runCleanup([]);

    expect(process.exitCode).toBe(1);
    expect(output()).toContain("Failed to reclaim 1 item(s):");
    expect(await branchNames()).toContain("worktree-agent-orphan");
  });

  test("a --run sweep reports the worker slots it released", async () => {
    await acquireSlot(2, "run-slots", process.pid, "CLA-50");

    await runCleanup(["--run", "run-slots"]);

    expect(process.exitCode).toBe(0);
    expect(output()).toContain("Released 1 worker slot(s) for run run-slots: 0.");
    expect(output()).toContain("Run run-slots marked closed.");
  });

  test("--all protects locked scaffolds by owner state and --force reclaims only a dead owner", async () => {
    const idle = path.join(repo, "outside-idle");
    const dead = path.join(repo, "outside-dead");
    const foreign = path.join(repo, "outside-foreign");
    await git("worktree", "add", "-q", "-b", "worktree-agent-idle", idle, "main");
    await git("worktree", "lock", idle, "--reason", ownedLock("run-idle", "CLA-60"));
    await git("worktree", "add", "-q", "-b", "worktree-agent-dead", dead, "main");
    await git("worktree", "lock", dead, "--reason", ownedLock("run-dead", "CLA-61", "-dead-slug"));
    await git("worktree", "add", "-q", "-b", "worktree-agent-foreign", foreign, "main");
    await git("worktree", "lock", foreign, "--reason", "do not touch");
    touchTranscript(transcriptSlug, "run-idle");

    await runCleanup(["--all"]);

    expect(process.exitCode).toBe(0);
    let logged = output();
    expect(logged).toContain("owning run is still active, protected:");
    expect(logged).toContain("worktree-agent-idle (run run-idle, idle)");
    expect(logged).toContain("worktree is locked, protected:");
    expect(logged).toContain("  - worktree-agent-dead");
    expect(logged).toContain("  - worktree-agent-foreign");

    logSpy.mockClear();
    await runCleanup(["--all", "--force", "--dry-run"]);

    logged = output();
    expect(logged).toContain(`Would delete: worktree-agent-dead (merged) — would remove ${dead}`);
    expect(existsSync(dead)).toBe(true);
    expect(await branchNames()).toContain("worktree-agent-dead");
    expect(await git("worktree", "list", "--porcelain")).toContain("locked emet run=run-dead");

    logSpy.mockClear();
    await runCleanup(["--all", "--force"]);

    logged = output();
    expect(logged).toContain("Deleted 1 branch(es):");
    expect(logged).toContain("  - worktree-agent-dead (merged)");
    expect(logged).toContain("worktree-agent-idle (run run-idle, idle)");
    expect(logged).toContain("  - worktree-agent-foreign");
    expect(process.exitCode).toBe(0);
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(idle)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
    const branches = await branchNames();
    expect(branches).not.toContain("worktree-agent-dead");
    expect(branches).toContain("worktree-agent-idle");
    expect(branches).toContain("worktree-agent-foreign");
  });

  test("--all --force keeps a dead owner's worktree whose branch has unmerged work", async () => {
    const dead = path.join(repo, "outside-dead");
    await git("worktree", "add", "-q", "-b", "worktree-agent-dead", dead, "main");
    writeFileSync(path.join(dead, "file.txt"), "unmerged\n");
    await git("-C", dead, "commit", "-q", "-am", "unmerged work");
    await git("worktree", "lock", dead, "--reason", ownedLock("run-dead", "CLA-62", "-dead-slug"));

    await runCleanup(["--all", "--force"]);

    expect(output()).toContain("worktree-agent-dead (diverged)");
    expect(existsSync(dead)).toBe(true);
    expect(await branchNames()).toContain("worktree-agent-dead");
  });

  test("a failed dead worktree removal keeps its branch and fails the run", async () => {
    const parent = path.join(repo, "locked-parent");
    mkdirSync(parent);
    const dead = path.join(parent, "outside-dead");
    await git("worktree", "add", "-q", "-b", "worktree-agent-dead", dead, "main");
    await git("worktree", "lock", dead, "--reason", ownedLock("run-dead", "CLA-63", "-dead-slug"));
    chmodSync(parent, 0o555);

    try {
      await runCleanup(["--all", "--force"]);
    } finally {
      chmodSync(parent, 0o755);
    }

    expect(process.exitCode).toBe(1);
    expect(output()).toContain("Failed to delete 1 branch(es):");
    expect(existsSync(dead)).toBe(true);
    expect(await branchNames()).toContain("worktree-agent-dead");
  });

  test("reclaimDeadWorktree prunes a locked worktree whose directory is already gone", async () => {
    const dead = path.join(repo, "outside-dead");
    await git("worktree", "add", "-q", "-b", "worktree-agent-dead", dead, "main");
    const reason = ownedLock("run-dead", "CLA-64", "-dead-slug");
    await git("worktree", "lock", dead, "--reason", reason);
    rmSync(dead, { recursive: true, force: true });

    const result = await reclaimDeadWorktree({
      directory: dead,
      branch: "worktree-agent-dead",
      lockedReason: reason,
    });

    expect(result).toEqual({ ok: true, message: dead });
    expect(await git("worktree", "list", "--porcelain")).not.toContain(dead);
    await git("branch", "-D", "worktree-agent-dead");
  });
});
