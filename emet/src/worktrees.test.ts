import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Reservation } from "./claims";
import {
  classifyByContent,
  findReservationForBranch,
  isAgentWorktree,
  isForeignWorktree,
  isForgeShapedBranch,
  parseWorktreeEntries,
  resolveMainTree,
  resolveWorktreeOwner,
  resolveWorktreeOwnerWithReservations,
  type WorktreeEntry,
} from "./worktrees";

describe("parseWorktreeEntries", () => {
  test("parses an unlocked worktree as lockedReason: null", () => {
    const output = ["worktree /repo", "HEAD abcdef1234567890", "branch refs/heads/main", ""].join(
      "\n",
    );
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: "/repo",
        branch: "main",
        lockedReason: null,
        head: "abcdef1234567890",
      },
    ]);
  });

  test("parses a locked worktree with a reason", () => {
    const output = [
      "worktree /repo/.claude/worktrees/agent-abc",
      "HEAD abcdef1234567890",
      "branch refs/heads/ao-258-forge-claims-registry",
      "locked forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
      "",
    ].join("\n");
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: "/repo/.claude/worktrees/agent-abc",
        branch: "ao-258-forge-claims-registry",
        lockedReason: "forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
        head: "abcdef1234567890",
      },
    ]);
  });

  test('parses a locked worktree with no reason as lockedReason: ""', () => {
    const output = [
      "worktree /repo/.claude/worktrees/agent-abc",
      "HEAD abcdef1234567890",
      "branch refs/heads/ao-258-forge-claims-registry",
      "locked",
      "",
    ].join("\n");
    expect(parseWorktreeEntries(output)).toEqual([
      {
        directory: "/repo/.claude/worktrees/agent-abc",
        branch: "ao-258-forge-claims-registry",
        lockedReason: "",
        head: "abcdef1234567890",
      },
    ]);
  });

  test("parses multiple entries, each resetting lockedReason", () => {
    const output = [
      "worktree /repo",
      "HEAD abcdef1234567890",
      "branch refs/heads/main",
      "",
      "worktree /repo/.claude/worktrees/agent-abc",
      "HEAD 1234567890abcdef",
      "branch refs/heads/ao-258-forge-claims-registry",
      "locked forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
      "",
    ].join("\n");
    const entries = parseWorktreeEntries(output);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.lockedReason).toBeNull();
    expect(entries[1]?.lockedReason).toBe(
      "forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
    );
  });
});

describe("resolveWorktreeOwner", () => {
  const baseEntry: WorktreeEntry = {
    directory: "/repo/.claude/worktrees/agent-abc",
    branch: "ao-258-forge-claims-registry",
    lockedReason: null,
  };

  test("round-trips a well-formed /forge lock reason", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason: "forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
    };
    expect(resolveWorktreeOwner(entry)).toEqual({
      runId: "run-1",
      ticket: "AO-258",
      anchorPid: 4242,
      at: "2026-09-07T20:00:00.000Z",
    });
  });

  test("parses a lock reason written with the emet token", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason:
        "emet run=run-1 ticket=AO-258 anchor=4242 slug=-home-andryore-code-repo at=2026-09-07T20:00:00.000Z",
    };
    expect(resolveWorktreeOwner(entry)).toEqual({
      runId: "run-1",
      ticket: "AO-258",
      anchorPid: 4242,
      at: "2026-09-07T20:00:00.000Z",
      coordinatorSlug: "-home-andryore-code-repo",
    });
  });

  test("returns null for a lock reason with an unknown leading token", () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason: "other run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
      }),
    ).toBeNull();
  });

  test("reads an optional slug= field when present", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason:
        "forge run=run-1 ticket=AO-258 anchor=4242 slug=-home-andryore-code-repo at=2026-09-07T20:00:00.000Z",
    };
    expect(resolveWorktreeOwner(entry)).toEqual({
      runId: "run-1",
      ticket: "AO-258",
      anchorPid: 4242,
      at: "2026-09-07T20:00:00.000Z",
      coordinatorSlug: "-home-andryore-code-repo",
    });
  });

  test("omits coordinatorSlug entirely for a lock reason written before slug= existed", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason: "forge run=run-1 ticket=AO-258 anchor=4242 at=2026-09-07T20:00:00.000Z",
    };
    expect(resolveWorktreeOwner(entry)?.coordinatorSlug).toBeUndefined();
    expect("coordinatorSlug" in (resolveWorktreeOwner(entry) ?? {})).toBe(false);
  });

  test("returns null for an unlocked worktree", () => {
    expect(resolveWorktreeOwner(baseEntry)).toBeNull();
  });

  test("returns null for a lock with no reason", () => {
    expect(resolveWorktreeOwner({ ...baseEntry, lockedReason: "" })).toBeNull();
  });

  test("returns null for a human's own unrelated lock reason", () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason: "testing something, do not delete",
      }),
    ).toBeNull();
  });

  test("returns null when a required key is missing", () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason: "forge run=run-1 ticket=AO-258 at=2026-09-07T20:00:00.000Z",
      }),
    ).toBeNull();
  });

  test("returns null when anchor is not a finite number", () => {
    expect(
      resolveWorktreeOwner({
        ...baseEntry,
        lockedReason: "forge run=run-1 ticket=AO-258 anchor=nope at=2026-09-07T20:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("findReservationForBranch", () => {
  const reservation: Reservation = {
    runId: "run-1",
    anchorPid: 4242,
    ticket: "AO-258",
    reservedAt: 1_700_000_000_000,
    sessionSlug: "-home-andryore-code-repo",
  };

  test("matches by numeric suffix when the branch prefix is not the ticket key", () => {
    expect(findReservationForBranch("ticket-258-login", "ticket", [reservation])).toEqual(
      reservation,
    );
  });

  test("matches a worker branch by its numeric ticket suffix", () => {
    expect(findReservationForBranch("ao-258-forge-claims-registry", "ao", [reservation])).toEqual(
      reservation,
    );
  });

  test("matches a bare <prefix>-<n> branch with no slug", () => {
    expect(findReservationForBranch("ao-258", "ao", [reservation])).toEqual(reservation);
  });

  test("returns null when no reservation names that ticket", () => {
    expect(findReservationForBranch("ao-999-unrelated", "ao", [reservation])).toBeNull();
  });

  test("returns null for a branch that isn't this repo's worker-branch shape", () => {
    expect(findReservationForBranch("feat/some-branch", "ao", [reservation])).toBeNull();
  });

  test("never matches a different ticket number sharing a prefix", () => {
    expect(findReservationForBranch("ao-2580-other", "ao", [reservation])).toBeNull();
  });
});

describe("resolveWorktreeOwnerWithReservations", () => {
  const reservation: Reservation = {
    runId: "run-1",
    anchorPid: 4242,
    ticket: "AO-258",
    reservedAt: 1_700_000_000_000,
    sessionSlug: "-home-andryore-code-repo",
  };
  const baseEntry: WorktreeEntry = {
    directory: "/repo/.claude/worktrees/agent-abc",
    branch: "ao-258-forge-claims-registry",
    lockedReason: null,
  };

  test("prefers a real /forge lock over the reservation fallback", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason: "forge run=run-2 ticket=AO-258 anchor=9999 at=2026-09-07T20:00:00.000Z",
    };
    expect(resolveWorktreeOwnerWithReservations(entry, [reservation], "ao")).toEqual({
      runId: "run-2",
      ticket: "AO-258",
      anchorPid: 9999,
      at: "2026-09-07T20:00:00.000Z",
    });
  });

  test("falls back to the live reservation when the harness dropped the lock", () => {
    expect(resolveWorktreeOwnerWithReservations(baseEntry, [reservation], "ao")).toEqual({
      runId: "run-1",
      ticket: "AO-258",
      anchorPid: 4242,
      at: new Date(1_700_000_000_000).toISOString(),
      coordinatorSlug: "-home-andryore-code-repo",
    });
  });

  test("never second-guesses a human's own unrelated lock reason", () => {
    const entry: WorktreeEntry = {
      ...baseEntry,
      lockedReason: "testing something, do not delete",
    };
    expect(resolveWorktreeOwnerWithReservations(entry, [reservation], "ao")).toBeNull();
  });

  test("returns null when no reservation matches either", () => {
    expect(resolveWorktreeOwnerWithReservations(baseEntry, [], "ao")).toBeNull();
  });
});

describe("isAgentWorktree", () => {
  test("accepts an agent worktree nested under the main checkout", () => {
    expect(isAgentWorktree("/home/andry/code/repo/.claude/worktrees/agent-abc")).toBe(true);
  });

  /**
   * The regression this whole helper exists to fix: a coordinator launched
   * from an Orca-managed secondary worktree still gets its agent worktrees
   * nested under the *main checkout's* `.claude/worktrees/`, not its own —
   * isAgentWorktree must recognize this shape too, with no repoRoot to match
   * against at all (see worktrees.ts's doc comment and
   * reference/incidents.md).
   */
  test("accepts an agent worktree under the main checkout even when the launching worktree differs", () => {
    expect(isAgentWorktree("/home/andry/code/repo/.claude/worktrees/agent-abc")).toBe(true);
    /**
     * The launching (Orca) worktree itself is irrelevant to this check —
     * there is no repoRoot parameter to pass it as.
     */
  });

  test("rejects the main checkout itself (not nested under .claude/worktrees/)", () => {
    expect(isAgentWorktree("/home/andry/code/repo")).toBe(false);
  });

  test("rejects an ordinary worktree with no .claude/worktrees/ segment", () => {
    expect(isAgentWorktree("/home/andry/orca/workspaces/repo/sandlance")).toBe(false);
  });

  test("rejects a path that merely contains the literal substring without path separators", () => {
    expect(isAgentWorktree("/home/andry/code/.claude-worktrees-backup")).toBe(false);
  });
});

const reserve = (ticket: string): Reservation => ({
  runId: "run-1",
  anchorPid: 1,
  ticket,
  reservedAt: 1_700_000_000_000,
  sessionSlug: "-repo",
});

describe("findReservationForBranch with slug-style ticket ids", () => {
  test("matches the full ticket id after the branch prefix", () => {
    const reservation = reserve("local-tracker-03");
    expect(
      findReservationForBranch("ticket-local-tracker-03-parser", "ticket", [reservation]),
    ).toEqual(reservation);
  });

  test("does not match a different spec sharing the trailing number", () => {
    expect(findReservationForBranch("ticket-a-01-parser", "ticket", [reserve("b-01")])).toBeNull();
  });

  test("prefers the longest matching ticket id", () => {
    const short = reserve("a-01");
    const long = reserve("a-01-extra");
    expect(findReservationForBranch("ticket-a-01-extra-slug", "ticket", [short, long])).toEqual(
      long,
    );
  });
});

describe("local trunk comparison", () => {
  let repoDirectory: string;
  let previousDirectory: string;

  const runGit = async (...args: string[]): Promise<string> =>
    (await Bun.$`git ${args}`.cwd(repoDirectory).quiet().text()).trim();

  beforeEach(async () => {
    previousDirectory = process.cwd();
    repoDirectory = mkdtempSync(path.join(os.tmpdir(), "forge-worktrees-test-"));
    await runGit("init", "-q", "-b", "main");
    await runGit("config", "user.email", "t@example.com");
    await runGit("config", "user.name", "t");
    await runGit("config", "commit.gpgsign", "false");
    await Bun.write(path.join(repoDirectory, "a.txt"), "base\n");
    await runGit("add", ".");
    await runGit("commit", "-q", "-m", "base");
    process.chdir(repoDirectory);
  });

  afterEach(() => {
    process.chdir(previousDirectory);
    rmSync(repoDirectory, { recursive: true, force: true });
  });

  test("resolveMainTree reads local trunk when local, with no remote", async () => {
    const expected = await runGit("rev-parse", "main^{tree}");
    expect(await resolveMainTree("origin", "main", { local: true })).toBe(expected);
    const remoteResult = await resolveMainTree("origin", "main").catch(() => "unresolvable");
    expect(remoteResult).toBe("unresolvable");
  });

  test("classifyByContent treats merged and squash-landed branches as safe locally", async () => {
    await runGit("checkout", "-q", "-b", "work");
    await Bun.write(path.join(repoDirectory, "b.txt"), "feature\n");
    await runGit("add", ".");
    await runGit("commit", "-q", "-m", "feature");
    await runGit("checkout", "-q", "main");
    await runGit("merge", "--squash", "work");
    await runGit("commit", "-q", "-m", "squash");

    const mainTree = await resolveMainTree("origin", "main", { local: true });
    const verdict = await classifyByContent("work", mainTree, "origin", "main", { local: true });
    expect(verdict).toBe("equivalent");

    await runGit("branch", "merged", "main");
    expect(await classifyByContent("merged", mainTree, "origin", "main", { local: true })).toBe(
      "merged",
    );
  });
});

const entry = (branch: string | null): WorktreeEntry => ({
  directory: "/repo/.claude/worktrees/x",
  branch,
  lockedReason: null,
});

describe("isForgeShapedBranch and isForeignWorktree", () => {
  const owner = { runId: "r", ticket: "CLA-1", anchorPid: 1, at: "2026-01-01T00:00:00Z" };

  test("recognises worker and harness agent branches", () => {
    expect(isForgeShapedBranch("cla-152-landed", "cla")).toBe(true);
    expect(isForgeShapedBranch("worktree-agent-abc", "cla")).toBe(true);
    expect(isForgeShapedBranch("chore/strict-lint-gates", "cla")).toBe(false);
    expect(isForgeShapedBranch("claim-1", "cla")).toBe(false);
  });

  test("a worktree with an owner is never foreign", () => {
    expect(isForeignWorktree(entry("chore/x"), owner, "cla")).toBe(false);
  });

  test("an unowned worktree on a foreign branch is foreign", () => {
    expect(isForeignWorktree(entry("chore/x"), null, "cla")).toBe(true);
    expect(isForeignWorktree(entry(null), null, "cla")).toBe(true);
  });

  test("an unowned worktree on a forge-shaped branch is not foreign", () => {
    expect(isForeignWorktree(entry("cla-3-x"), null, "cla")).toBe(false);
  });
});
