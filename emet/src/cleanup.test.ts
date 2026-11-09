import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { didReserveTicket, listReservations, releaseTicket } from "./claims";
import {
  collectUnits,
  deleteAndReleaseTicket,
  findOrphanedScaffoldBranches,
  findWorktreeEntryForBranch,
  guardBranch,
  CleanupUsageError,
  parseCleanupArguments,
  planOrphanedScaffolds,
  planWorktreeRemoval,
  reclaimOwnedWorktrees,
  run as runCleanup,
  shouldMarkRunClosed,
} from "./cleanup";
import { readPhase } from "./phase";
import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";
import { resolveLandedVerdict } from "./landed";
import {
  classifyWorktreeEntry,
  describeWorktreeEntryVerdict,
  ticketFromWorkerBranch,
} from "./preflight";
import { isRunClosed } from "./runs";
import {
  listBranches,
  listLiveWorktreeDirectoryNames,
  listWorktreeEntries,
  resolveMainTree,
  type BranchVerdict,
  type WorktreeEntry,
} from "./worktrees";

function lockedEntry(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    directory: "/repo/.claude/worktrees/agent-a1",
    branch: "ao-260-forge-cleanup-run-scoped",
    lockedReason: "emet run=session-a ticket=AO-260 anchor=4242 at=2026-09-07T00:00:00Z",
    ...overrides,
  };
}

describe("parseCleanupArguments", () => {
  test("no flags is the finished-runs reclaim", () => {
    expect(parseCleanupArguments([])).toEqual({
      dryRun: false,
      mode: "finished",
      runId: null,
      force: false,
    });
  });

  test("--dry-run alone previews the finished-runs reclaim", () => {
    expect(parseCleanupArguments(["--dry-run"])).toEqual({
      dryRun: true,
      mode: "finished",
      runId: null,
      force: false,
    });
  });

  test("--run <id> captures the run id", () => {
    expect(parseCleanupArguments(["--dry-run", "--run", "session-a"])).toEqual({
      dryRun: true,
      mode: "run",
      runId: "session-a",
      force: false,
    });
  });

  test("--all is the explicit repo-wide mode and combines with --force", () => {
    expect(parseCleanupArguments(["--all", "--force"])).toEqual({
      dryRun: false,
      mode: "all",
      runId: null,
      force: true,
    });
  });

  test("--run with no value or followed by a flag throws", () => {
    expect(() => parseCleanupArguments(["--run"])).toThrow(CleanupUsageError);
    expect(() => parseCleanupArguments(["--run", "--dry-run"])).toThrow(CleanupUsageError);
  });

  test("--run and --all together throws", () => {
    expect(() => parseCleanupArguments(["--run", "session-a", "--all"])).toThrow(
      /mutually exclusive/,
    );
  });
});

describe("planWorktreeRemoval", () => {
  const owner = {
    runId: "session-a",
    ticket: "AO-260",
    anchorPid: 4242,
    at: "2026-09-07T00:00:00Z",
  };

  test("a landed clean owned worktree is removed", () => {
    expect(planWorktreeRemoval(lockedEntry(), owner, "landed", false)).toBe("remove");
  });

  test("an unlocked worktree attributed by claim is removed when landed and clean", () => {
    expect(planWorktreeRemoval(lockedEntry({ lockedReason: null }), owner, "landed", false)).toBe(
      "remove",
    );
  });

  test("a dirty landed worktree is kept", () => {
    expect(planWorktreeRemoval(lockedEntry(), owner, "landed", true)).toBe("keep-dirty");
  });

  test("not-landed and unknown verdicts are kept, so a tracker error never removes", () => {
    expect(planWorktreeRemoval(lockedEntry(), owner, "not-landed", false)).toBe("keep-not-landed");
    expect(planWorktreeRemoval(lockedEntry(), owner, "unknown", false)).toBe("keep-not-landed");
  });

  test("no owner is protected", () => {
    expect(planWorktreeRemoval(lockedEntry(), null, "landed", false)).toBe("protected");
  });

  test("an unowned unlocked worktree is removed only when landed and clean", () => {
    const entry = lockedEntry({ lockedReason: null, branch: "cla-355-x" });
    expect(planWorktreeRemoval(entry, null, "landed", false)).toBe("remove");
    expect(planWorktreeRemoval(entry, null, "landed", true)).toBe("protected");
    expect(planWorktreeRemoval(entry, null, "not-landed", false)).toBe("protected");
    expect(planWorktreeRemoval(entry, null, "unknown", false)).toBe("protected");
  });

  test("an unowned detached worktree is protected", () => {
    const entry = lockedEntry({ lockedReason: null, branch: null });
    expect(planWorktreeRemoval(entry, null, "landed", false)).toBe("protected");
  });

  test("a non-forge lock stays protected even when a claim supplied an owner", () => {
    const entry = lockedEntry({ lockedReason: "human lock" });
    expect(planWorktreeRemoval(entry, owner, "landed", false)).toBe("protected");
  });
});

describe("findWorktreeEntryForBranch", () => {
  test("matches an ao-* branch directly on entry.branch", () => {
    const entry = lockedEntry();
    expect(findWorktreeEntryForBranch("ao-260-forge-cleanup-run-scoped", [entry])).toBe(entry);
  });

  test("matches a worktree-agent-* scaffold branch via the directory basename", () => {
    const entry = lockedEntry({ directory: "/repo/.claude/worktrees/agent-a1" });
    expect(findWorktreeEntryForBranch("worktree-agent-a1", [entry])).toBe(entry);
  });

  test("returns undefined when nothing matches", () => {
    const entry = lockedEntry();
    expect(findWorktreeEntryForBranch("ao-999-unrelated", [entry])).toBeUndefined();
  });
});

describe("guardBranch", () => {
  test("a live worktree checkout is always in-use, before any lock check", () => {
    const outcome = guardBranch(true, lockedEntry(), null);
    expect(outcome).toEqual({ done: true, category: "in-use" });
  });

  test("no matched entry and no run scope proceeds to content classification", () => {
    const outcome = guardBranch(false, undefined, null);
    expect(outcome).toEqual({ done: false, owner: null });
  });

  test("no matched entry in --run mode is out-of-scope", () => {
    const outcome = guardBranch(false, undefined, "session-a");
    expect(outcome).toEqual({ done: true, category: "out-of-scope" });
  });

  test("an unlocked matched entry with no run scope proceeds to content classification", () => {
    const outcome = guardBranch(false, lockedEntry({ lockedReason: null }), null);
    expect(outcome).toEqual({ done: false, owner: null });
  });

  describe("--run scoping", () => {
    test("a locked worktree owned by the target run proceeds, carrying its owner", () => {
      const outcome = guardBranch(false, lockedEntry(), "session-a");
      expect(outcome).toEqual({
        done: false,
        owner: {
          runId: "session-a",
          ticket: "AO-260",
          anchorPid: 4242,
          at: "2026-09-07T00:00:00Z",
        },
      });
    });

    test("a locked worktree owned by a different run is out-of-scope", () => {
      const outcome = guardBranch(false, lockedEntry(), "session-other");
      expect(outcome).toEqual({ done: true, category: "out-of-scope" });
    });

    test("a lock reason that is not /forge-shaped is out-of-scope", () => {
      const outcome = guardBranch(
        false,
        lockedEntry({ lockedReason: "someone else, manually" }),
        "session-a",
      );
      expect(outcome).toEqual({ done: true, category: "out-of-scope" });
    });
  });

  describe("default/--all repo-wide sweep", () => {
    test("a locked worktree whose owning run is live is protected, never reaching content classification", () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => "live");
      expect(outcome).toEqual({
        done: true,
        category: "live-or-idle-protected",
        ownerRunId: "session-a",
        runVerdict: "live",
      });
    });

    test("a locked worktree whose owning run is idle is protected too", () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => "idle");
      expect(outcome).toEqual({
        done: true,
        category: "live-or-idle-protected",
        ownerRunId: "session-a",
        runVerdict: "idle",
      });
    });

    test('a locked worktree whose owning run is dead still never reaches classification without --force: it is just "locked, protected"', () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => "dead");
      expect(outcome).toEqual({ done: true, category: "locked-protected" });
    });

    test("--force lifts protection on a dead owner, letting classification proceed", () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => "dead", true);
      expect(outcome).toEqual({
        done: false,
        owner: {
          runId: "session-a",
          ticket: "AO-260",
          anchorPid: 4242,
          at: "2026-09-07T00:00:00Z",
        },
      });
    });

    test("--force does not lift protection on a live or idle owner", () => {
      const outcome = guardBranch(false, lockedEntry(), null, () => "live", true);
      expect(outcome).toEqual({
        done: true,
        category: "live-or-idle-protected",
        ownerRunId: "session-a",
        runVerdict: "live",
      });
    });

    test('a locked worktree with a non-/forge lock reason is "locked, protected" even with --force', () => {
      const outcome = guardBranch(
        false,
        lockedEntry({ lockedReason: "wip, do not touch" }),
        null,
        () => "dead",
        true,
      );
      expect(outcome).toEqual({ done: true, category: "locked-protected" });
    });

    test("uses the lock reason's own slug= as the coordinator's session slug, not the worktree's directory", () => {
      const seen: unknown[] = [];
      guardBranch(
        false,
        lockedEntry({
          lockedReason:
            "forge run=session-a ticket=AO-260 anchor=4242 slug=-home-andryore-code-repo at=2026-09-07T00:00:00Z",
        }),
        null,
        (anchorPid, sessionSlug, runId) => {
          seen.push({ anchorPid, sessionSlug, runId });
          return "dead";
        },
      );
      expect(seen).toEqual([
        { anchorPid: 4242, sessionSlug: "-home-andryore-code-repo", runId: "session-a" },
      ]);
    });

    test("falls back to the worktree directory-derived slug when the lock reason predates slug=", () => {
      const seen: unknown[] = [];
      guardBranch(false, lockedEntry(), null, (anchorPid, sessionSlug, runId) => {
        seen.push({ anchorPid, sessionSlug, runId });
        return "dead";
      });
      expect(seen).toEqual([
        {
          anchorPid: 4242,
          sessionSlug: "-repo--claude-worktrees-agent-a1",
          runId: "session-a",
        },
      ]);
    });
  });
});

describe("deleteAndReleaseTicket", () => {
  let forgeDirectory: string;

  beforeEach(() => {
    forgeDirectory = mkdtempSync(path.join(os.tmpdir(), "forge-cleanup-test-"));
  });

  afterEach(() => {
    rmSync(forgeDirectory, { recursive: true, force: true });
  });

  test("releases the ticket reservation after a successful deletion", async () => {
    await Bun.write(
      path.join(forgeDirectory, "tickets", "AO-260.json"),
      JSON.stringify({
        runId: "session-a",
        anchorPid: 4242,
        ticket: "AO-260",
        reservedAt: Date.now(),
        sessionSlug: "-repo",
      }),
    );
    expect(await listReservations(forgeDirectory)).toHaveLength(1);

    const result = await deleteAndReleaseTicket(
      "ao-260-forge-cleanup-run-scoped",
      "AO-260",
      "session-a",
      (branch) => Promise.resolve({ ok: true, message: branch }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
    );

    expect(result).toEqual({
      ok: true,
      message: "ao-260-forge-cleanup-run-scoped",
    });
    expect(await listReservations(forgeDirectory)).toEqual([]);
  });

  test("never releases the reservation when the deletion itself fails", async () => {
    await Bun.write(
      path.join(forgeDirectory, "tickets", "AO-260.json"),
      JSON.stringify({
        runId: "session-a",
        anchorPid: 4242,
        ticket: "AO-260",
        reservedAt: Date.now(),
        sessionSlug: "-repo",
      }),
    );

    const result = await deleteAndReleaseTicket(
      "ao-260-forge-cleanup-run-scoped",
      "AO-260",
      "session-a",
      (branch) => Promise.resolve({ ok: false, message: `${branch} — locked` }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
    );

    expect(result.ok).toBe(false);
    expect(await listReservations(forgeDirectory)).toHaveLength(1);
  });

  test("no ticket is passed outside --run mode: releaseFn is never invoked", async () => {
    let releaseCalls = 0;
    const result = await deleteAndReleaseTicket(
      "worktree-agent-a1",
      undefined,
      undefined,
      (branch) => Promise.resolve({ ok: true, message: branch }),
      () => {
        releaseCalls += 1;
        return Promise.resolve({ outcome: "released" as const });
      },
    );

    expect(result.ok).toBe(true);
    expect(releaseCalls).toBe(0);
  });

  /**
   * Regression guard: `ticket`/`ownerRunId` are only ever set together by
   * `classifyOneBranch` (see this function's own doc comment) — this pins
   * that a `ticket` with no `ownerRunId` never releases anything, so a
   * future caller can't accidentally reintroduce the unscoped
   * `releaseTicket(ticket)` this function replaced.
   */
  test("a ticket with no ownerRunId never releases either", async () => {
    let releaseCalls = 0;
    const result = await deleteAndReleaseTicket(
      "ao-260-forge-cleanup-run-scoped",
      "AO-260",
      undefined,
      (branch) => Promise.resolve({ ok: true, message: branch }),
      () => {
        releaseCalls += 1;
        return Promise.resolve({ outcome: "released" as const });
      },
    );

    expect(result.ok).toBe(true);
    expect(releaseCalls).toBe(0);
  });

  test("does not release a reservation owned by a different run", async () => {
    await Bun.write(
      path.join(forgeDirectory, "tickets", "AO-260.json"),
      JSON.stringify({
        runId: "session-other",
        anchorPid: 4242,
        ticket: "AO-260",
        reservedAt: Date.now(),
        sessionSlug: "-repo",
      }),
    );

    const result = await deleteAndReleaseTicket(
      "ao-260-forge-cleanup-run-scoped",
      "AO-260",
      "session-a",
      (branch) => Promise.resolve({ ok: true, message: branch }),
      (ticket, runId) => releaseTicket(ticket, runId, { forgeDirectory }),
    );

    expect(result.ok).toBe(true);
    expect(await listReservations(forgeDirectory)).toMatchObject([
      { runId: "session-other", ticket: "AO-260" },
    ]);
  });
});

describe("shouldMarkRunClosed", () => {
  test("a clean --run sweep marks the run closed", () => {
    expect(shouldMarkRunClosed("run", "run-a", false, 0)).toBe(true);
  });

  test("any failure keeps the run open", () => {
    expect(shouldMarkRunClosed("run", "run-a", false, 1)).toBe(false);
  });

  test("a dry run or a non --run sweep never marks closed", () => {
    expect(shouldMarkRunClosed("run", "run-a", true, 0)).toBe(false);
    expect(shouldMarkRunClosed("finished", null, false, 0)).toBe(false);
  });
});

function scaffoldBranch(name: string, worktreePath = "") {
  return { name, worktreePath };
}

function lockReason(runId: string, ticket: string): string {
  return `emet run=${runId} ticket=${ticket} anchor=${process.pid} at=2026-09-07T00:00:00Z`;
}

async function lockOf(directory: string): Promise<string | null> {
  const entry = (await listWorktreeEntries()).find((item) => item.directory === directory);
  return entry?.lockedReason ?? null;
}

describe("findOrphanedScaffoldBranches", () => {
  test("keeps scaffolds with a live directory or a checkout, returns the rest", () => {
    const entries: WorktreeEntry[] = [
      { directory: "/repo", branch: "main", lockedReason: null },
      { directory: "/repo/.claude/worktrees/agent-live", branch: "cla-1-x", lockedReason: null },
      {
        directory: "/repo/.claude/worktrees/agent-onscaffold",
        branch: "worktree-agent-onscaffold",
        lockedReason: null,
      },
    ];
    const orphans = findOrphanedScaffoldBranches(
      [
        scaffoldBranch("worktree-agent-live"),
        scaffoldBranch("worktree-agent-onscaffold", "/repo/.claude/worktrees/agent-onscaffold"),
        scaffoldBranch("worktree-agent-gone"),
      ],
      entries,
      new Set(["agent-live", "agent-onscaffold"]),
    );
    expect(orphans).toEqual(["worktree-agent-gone"]);
  });
});

describe("planOrphanedScaffolds", () => {
  test("only merged or equivalent scaffolds are deletable, the rest are kept with their verdict", async () => {
    const verdicts = new Map<string, BranchVerdict>([
      ["worktree-agent-merged", "merged"],
      ["worktree-agent-squashed", "equivalent"],
      ["worktree-agent-diverged", "diverged"],
      ["worktree-agent-conflicted", "conflicted"],
    ]);
    const plan = await planOrphanedScaffolds([...verdicts.keys()], (branch) =>
      Promise.resolve(verdicts.get(branch) ?? "conflicted"),
    );
    expect(plan.deletable).toEqual(["worktree-agent-merged", "worktree-agent-squashed"]);
    expect(plan.kept).toEqual([
      { name: "worktree-agent-diverged", verdict: "diverged" },
      { name: "worktree-agent-conflicted", verdict: "conflicted" },
    ]);
  });
});

describe("reclaim against a real repository", () => {
  const originalDirectory = process.cwd();
  let repo: string;
  let logSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  const config: ForgeConfig = {
    ...DEFAULT_FORGE_CONFIG,
    ticket: { ...DEFAULT_FORGE_CONFIG.ticket, branchPrefix: "cla" },
    landing: { mode: "merge" },
  };

  async function git(...args: string[]): Promise<string> {
    const result = await Bun.$`git ${args}`.cwd(repo).quiet();
    return result.stdout.toString().trim();
  }

  async function addWorktree(options: {
    agentId: string;
    branch: string;
    runId: string;
    ticket: string;
    scaffold?: boolean;
  }): Promise<string> {
    const directory = path.join(repo, ".claude", "worktrees", options.agentId);
    const first = options.scaffold ? `worktree-${options.agentId}` : options.branch;
    await git("worktree", "add", "-q", "-b", first, directory, "main");
    if (options.scaffold) await git("-C", directory, "checkout", "-q", "-b", options.branch);
    await git("worktree", "lock", directory, "--reason", lockReason(options.runId, options.ticket));
    await didReserveTicket(options.runId, process.pid, options.ticket);
    return directory;
  }

  async function buildContext(mode: "run" | "finished", runId: string | null, dryRun = false) {
    return {
      config,
      mode,
      runId,
      dryRun,
      trunkRef: "main",
      mainSha: await git("rev-parse", "main"),
      idleThresholdMs: 1000,
      worktreeEntries: await listWorktreeEntries(),
      agentBranches: await listBranches("worktree-agent-*"),
      workerBranches: await listBranches("cla-*"),
      liveDirectoryNames: await listLiveWorktreeDirectoryNames(),
      readTrackerState: () => Promise.resolve("done" as const),
    };
  }

  async function branchNames(): Promise<string[]> {
    const output = await git("branch", "--format=%(refname:short)");
    return output.split("\n").filter((name) => name.length > 0);
  }

  beforeEach(async () => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "cleanup-real-")));
    await git("init", "-q", "-b", "main");
    await git("config", "user.email", "test@example.com");
    await git("config", "user.name", "Test");
    await git("config", "commit.gpgsign", "false");
    writeFileSync(path.join(repo, "file.txt"), "base\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "base");
    mkdirSync(path.join(repo, ".claude", "worktrees"), { recursive: true });
    process.chdir(repo);
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.chdir(originalDirectory);
    process.exitCode = 0;
    rmSync(repo, { recursive: true, force: true });
  });

  test("a clean landed worktree is removed, a dirty one stays locked and claimed", async () => {
    const cleanDirectory = await addWorktree({
      agentId: "agent-clean",
      branch: "cla-1-clean",
      runId: "run-a",
      ticket: "CLA-1",
      scaffold: true,
    });
    const dirtyDirectory = await addWorktree({
      agentId: "agent-dirty",
      branch: "cla-2-dirty",
      runId: "run-a",
      ticket: "CLA-2",
      scaffold: true,
    });
    writeFileSync(path.join(dirtyDirectory, "untracked.txt"), "wip\n");

    await reclaimOwnedWorktrees(await buildContext("run", "run-a"));

    expect(existsSync(cleanDirectory)).toBe(false);
    const branches = await branchNames();
    expect(branches).not.toContain("cla-1-clean");
    expect(branches).not.toContain("worktree-agent-clean");
    expect((await listReservations()).map((item) => item.ticket)).toEqual(["CLA-2"]);

    expect(existsSync(dirtyDirectory)).toBe(true);
    expect(await lockOf(dirtyDirectory)).toBe(lockReason("run-a", "CLA-2"));
    expect(branches).toContain("cla-2-dirty");
    expect(branches).toContain("worktree-agent-dirty");
    expect(await isRunClosed("run-a")).toBe(true);
  });

  test("a claimed branch whose worktree is gone is deleted and its claim released", async () => {
    await git("branch", "cla-3-gone", "main");
    await didReserveTicket("run-a", process.pid, "CLA-3");

    await reclaimOwnedWorktrees(await buildContext("run", "run-a"));

    expect(await branchNames()).not.toContain("cla-3-gone");
    expect(await listReservations()).toHaveLength(0);
  });

  test("orphaned scaffold branches are deleted, live ones are not", async () => {
    await git("branch", "worktree-agent-orphan", "main");
    await addWorktree({
      agentId: "agent-live",
      branch: "cla-4-live",
      runId: "run-b",
      ticket: "CLA-4",
      scaffold: true,
    });

    await reclaimOwnedWorktrees({
      ...(await buildContext("finished", null)),
      resolveState: () => Promise.resolve("live" as const),
    });

    const branches = await branchNames();
    expect(branches).not.toContain("worktree-agent-orphan");
    expect(branches).toContain("worktree-agent-live");
    expect(branches).toContain("cla-4-live");
  });

  test("an orphaned scaffold already inside trunk is deleted", async () => {
    await git("branch", "worktree-agent-behind", "main");
    writeFileSync(path.join(repo, "file.txt"), "advanced\n");
    await git("commit", "-q", "-am", "advance trunk");

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(await branchNames()).not.toContain("worktree-agent-behind");
  });

  test("an orphaned scaffold with a commit not on trunk survives and is reported", async () => {
    const scratch = path.join(repo, "scratch");
    await git("worktree", "add", "-q", "-b", "worktree-agent-unmerged", scratch, "main");
    writeFileSync(path.join(scratch, "file.txt"), "unmerged work\n");
    await git("-C", scratch, "commit", "-q", "-am", "unmerged work");
    await git("worktree", "remove", scratch);

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(await branchNames()).toContain("worktree-agent-unmerged");
    expect(process.exitCode).not.toBe(1);
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
    expect(output).toContain(
      "worktree-agent-unmerged (diverged) — git branch -D worktree-agent-unmerged",
    );
  });

  test("a dry run deletes no orphaned scaffold branch", async () => {
    await git("branch", "worktree-agent-orphan", "main");

    await reclaimOwnedWorktrees(await buildContext("finished", null, true));

    expect(await branchNames()).toContain("worktree-agent-orphan");
  });

  test("a failed unit leaves the run open and its claim in place", async () => {
    await didReserveTicket("run-a", process.pid, "CLA-5");
    const context = await buildContext("run", "run-a");

    await reclaimOwnedWorktrees({
      ...context,
      workerBranches: [{ name: "cla-5-ghost", worktreePath: "" }],
    });

    expect(process.exitCode).toBe(1);
    expect(await isRunClosed("run-a")).toBe(false);
    expect(await listReservations()).toHaveLength(1);
  });

  async function addUnownedWorktree(agentId: string, branch: string): Promise<string> {
    const directory = path.join(repo, ".claude", "worktrees", agentId);
    await git("worktree", "add", "-q", "-b", `worktree-${agentId}`, directory, "main");
    await git("-C", directory, "checkout", "-q", "-b", branch);
    return directory;
  }

  function loggedOutput(): string {
    return logSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
  }

  test("bare cleanup reclaims an unowned clean worktree whose ticket landed", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(existsSync(directory)).toBe(false);
    const branches = await branchNames();
    expect(branches).not.toContain("cla-355-x");
    expect(branches).not.toContain("worktree-agent-unowned");
    expect(process.exitCode).not.toBe(1);
  });

  test("an unowned dirty worktree stays protected with the manual command", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");
    writeFileSync(path.join(directory, "untracked.txt"), "wip\n");

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(existsSync(directory)).toBe(true);
    expect(await branchNames()).toContain("cla-355-x");
    const output = loggedOutput();
    expect(output).toContain("cla-355-x");
    expect(output).toContain("protected");
    expect(output).toContain(`git worktree remove "${directory}"`);
  });

  test("an unowned worktree whose ticket has not landed stays protected", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");

    await reclaimOwnedWorktrees({
      ...(await buildContext("finished", null)),
      readTrackerState: () => Promise.resolve("open" as const),
    });

    expect(existsSync(directory)).toBe(true);
    expect(await branchNames()).toContain("cla-355-x");
    expect(loggedOutput()).toContain("protected");
  });

  test("an unowned dirty worktree names the shared reason", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");
    writeFileSync(path.join(directory, "untracked.txt"), "wip\n");

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(loggedOutput()).toContain("cla-355-x — no owner, dirty tree, protected");
  });

  test("an unowned worker worktree under a non-emet lock stays protected with the shared reason", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");
    await git("worktree", "lock", directory, "--reason", "do not touch, debugging");

    await reclaimOwnedWorktrees(await buildContext("finished", null));

    expect(existsSync(directory)).toBe(true);
    expect(await lockOf(directory)).toBe("do not touch, debugging");
    expect(await branchNames()).toContain("cla-355-x");
    expect(loggedOutput()).toContain("cla-355-x — no owner, locked by another tool, protected");
  });

  async function preflightAdvice(trackerState: "done" | "open"): Promise<string> {
    const entry = (await listWorktreeEntries()).find((candidate) =>
      candidate.directory.endsWith("agent-unowned"),
    );
    if (entry === undefined) throw new Error("fixture worktree missing");
    const verdict = classifyWorktreeEntry(entry, undefined, () => "dead", undefined, {
      branchPrefix: "cla",
    });
    const report = await describeWorktreeEntryVerdict(
      entry,
      verdict,
      await resolveMainTree("origin", "main", { local: true }),
      "origin",
      "main",
      true,
      (branch) =>
        resolveLandedVerdict(
          { ticket: ticketFromWorkerBranch(branch, "cla") ?? "", branch },
          { config, readTrackerState: () => Promise.resolve(trackerState) },
        ),
      { branchPrefix: "cla" },
    );
    return report.line;
  }

  test.each([
    { name: "landed and clean", tracker: "done" as const, dirty: false, lock: null, acts: true },
    { name: "landed but dirty", tracker: "done" as const, dirty: true, lock: null, acts: false },
    {
      name: "open ticket with content equivalent to trunk",
      tracker: "open" as const,
      dirty: false,
      lock: null,
      acts: false,
    },
    {
      name: "landed under a non-emet lock",
      tracker: "done" as const,
      dirty: false,
      lock: "do not touch, debugging",
      acts: false,
    },
  ])("preflight and cleanup agree: $name", async ({ tracker, dirty, lock, acts }) => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");
    if (dirty) writeFileSync(path.join(directory, "untracked.txt"), "wip\n");
    if (lock !== null) await git("worktree", "lock", directory, "--reason", lock);

    const advice = await preflightAdvice(tracker);
    await reclaimOwnedWorktrees({
      ...(await buildContext("finished", null)),
      readTrackerState: () => Promise.resolve(tracker),
    });

    expect(advice.includes('safe to run "emet cleanup"')).toBe(acts);
    expect(existsSync(directory)).toBe(!acts);
    if (!acts) {
      const reason = /"emet cleanup" leaves it: ([^—(]+?)(?: —|\)|$)/.exec(advice)?.[1];
      expect(reason).toBeDefined();
      expect(loggedOutput()).toContain(`cla-355-x — no owner, ${reason}, protected`);
    }
  });

  test("an unowned worktree is never reclaimed by a run-scoped sweep", async () => {
    const directory = await addUnownedWorktree("agent-unowned", "cla-355-x");

    await reclaimOwnedWorktrees(await buildContext("run", "run-a"));

    expect(existsSync(directory)).toBe(true);
    expect(await branchNames()).toContain("cla-355-x");
  });

  test("bare cleanup leaves live and idle runs and foreign worktrees out of units", async () => {
    await addWorktree({
      agentId: "agent-live",
      branch: "cla-6-live",
      runId: "run-live",
      ticket: "CLA-6",
    });
    await addWorktree({
      agentId: "agent-idle",
      branch: "cla-7-idle",
      runId: "run-idle",
      ticket: "CLA-7",
    });
    await addWorktree({
      agentId: "agent-done",
      branch: "cla-8-done",
      runId: "run-done",
      ticket: "CLA-8",
    });
    await git("worktree", "add", "-q", "-b", "feature-x", path.join(repo, "foreign"), "main");

    const states: Record<string, "live" | "idle" | "closed"> = {
      "run-live": "live",
      "run-idle": "idle",
      "run-done": "closed",
    };
    const context = {
      ...(await buildContext("finished", null)),
      resolveState: (owner: { runId: string }) => Promise.resolve(states[owner.runId] ?? "live"),
    };

    const { units, protectedLines } = await collectUnits(context);

    expect(units.map((unit) => unit.owner?.runId)).toEqual(["run-done"]);
    expect(
      protectedLines.some((line) => line.includes("cla-6-live") && line.includes("live")),
    ).toBe(true);
    expect(
      protectedLines.some((line) => line.includes("cla-7-idle") && line.includes("idle")),
    ).toBe(true);
    expect(protectedLines.some((line) => line.includes("feature-x"))).toBe(false);
    expect(units.some((unit) => unit.branches.includes("feature-x"))).toBe(false);
  });
});

async function cleanupIn(argv: string[], unwritable: boolean): Promise<string> {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "cleanup-phase-")));
  const git = (...args: string[]) => Bun.spawnSync(["git", "-C", root, ...args]);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  writeFileSync(path.join(root, "emet.config.json"), JSON.stringify({}));
  git("add", ".");
  git("commit", "-q", "-m", "init");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  if (unwritable) mkdirSync(path.join(root, ".emet", "phase.json"), { recursive: true });
  const previousDirectory = process.cwd();
  const previousExit = process.exitCode;
  const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
  try {
    process.chdir(root);
    process.exitCode = 0;
    await runCleanup(argv);
    expect(process.exitCode).toBe(0);
  } finally {
    logSpy.mockRestore();
    process.chdir(previousDirectory);
    process.exitCode = previousExit ?? 0;
  }
  return root;
}

describe("cleanup phase file", () => {
  test("writes the done phase with the run id for a run sweep", async () => {
    const root = await cleanupIn(["--run", "emet1w1"], false);
    expect(readPhase(root)).toMatchObject({ phase: "done", runId: "emet1w1" });
  });

  test("a bare sweep does not touch another run's phase", async () => {
    const root = await cleanupIn([], false);
    expect(readPhase(root)).toBeNull();
  });

  test("a dry run does not write the phase", async () => {
    const root = await cleanupIn(["--dry-run"], false);
    expect(readPhase(root)).toBeNull();
  });

  test("an unwritable phase file does not change the exit code", async () => {
    await cleanupIn(["--run", "emet1w1"], true);
  });
});
