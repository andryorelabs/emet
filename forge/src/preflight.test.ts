import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeApproval } from "./approve";
import { DEFAULT_FORGE_CONFIG } from "./config";
import type { DependencyCheck, DependencyProbes } from "./dependencies";
import type { EnvironmentProbes } from "./doctor";
import {
  auditPostDispatch,
  checkSlotCapacity,
  classifyWorktreeEntry,
  collectForkBaseFailures,
  collectMapStaleWarning,
  evaluateDependencyGate,
  evaluateRunGate,
  DEPRECATED_CONFIG_FIELDS,
  collectDependencyChecks,
  findBranchTicketMismatches,
  findDuplicateTicketBranchNumbers,
  findDuplicateTicketWorktrees,
  findMissingRequiredCommands,
  findMissingTicketsForRun,
  findTodoMarkers,
  findWorktreesMissingLockPastDeadline,
  isBranchMatchingTicket,
} from "./preflight";
import type { WorktreeEntry, WorktreeOwner } from "./worktrees";

describe("evaluateRunGate (S9, S15)", () => {
  const spec = "- **S1**: does a thing. Scenario: when x then y.\n";
  const tickets = [{ id: "T1", covers: ["S1"], surfaces: ["a.ts"], wave: 1, blockedBy: [] }];

  function setUpRun(ticketList: unknown = tickets): string {
    const directory = mkdtempSync(path.join(tmpdir(), "preflight-gate-"));
    writeFileSync(path.join(directory, "spec.md"), spec);
    writeFileSync(path.join(directory, "tickets.json"), JSON.stringify(ticketList));
    writeApproval({
      approvalPath: path.join(directory, "approval.json"),
      specPath: path.join(directory, "spec.md"),
      ticketsPath: path.join(directory, "tickets.json"),
    });
    return directory;
  }

  test("passes for an approved, valid plan", () => {
    const gate = evaluateRunGate(setUpRun(), { inlineMaxLines: 100 });
    expect(gate.failures).toEqual([]);
  });

  test("fails when the approval record is missing", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "preflight-gate-"));
    expect(evaluateRunGate(directory, { inlineMaxLines: 100 }).failures[0]).toContain("approval:");
  });

  test("fails when tickets changed after approval", () => {
    const directory = setUpRun();
    writeFileSync(path.join(directory, "tickets.json"), "[]");
    const gate = evaluateRunGate(directory, { inlineMaxLines: 100 });
    expect(gate.failures.join("\n")).toContain("tickets changed since approval");
  });

  test("fails validate when a spec item is uncovered", () => {
    const directory = setUpRun([{ ...tickets[0], covers: [] }]);
    const gate = evaluateRunGate(directory, { inlineMaxLines: 100 });
    expect(gate.failures.some((line) => line.startsWith("validate:"))).toBe(true);
  });
});

const probesFor = (head: string, base: string, setting: string | null): EnvironmentProbes => ({
  helpText: async () => null,
  ghRepoNameWithOwner: async () => null,
  remoteUrl: async () => null,
  resolveRef: async (_root, ref) => (ref === "HEAD" ? head : base),
  worktreeBaseRef: async () => setting,
});

describe("collectForkBaseFailures (S2)", () => {
  test("flags a harness base that differs from the coordinator HEAD", async () => {
    const failures = await collectForkBaseFailures(
      "/r",
      "origin",
      "main",
      probesFor("aaaaaaa1", "bbbbbbb2", null),
    );
    expect(failures).toHaveLength(1);
  });

  test("merge mode compares against local trunk, not <remote>/<trunk>", async () => {
    const refs: string[] = [];
    const probes: EnvironmentProbes = {
      ...probesFor("aaaaaaa1", "bbbbbbb2", null),
      resolveRef: async (_root, ref) => {
        refs.push(ref);
        return ref === "HEAD" ? "aaaaaaa1" : "bbbbbbb2";
      },
    };
    const failures = await collectForkBaseFailures("/r", "origin", "main", probes, "merge");
    expect(refs).toContain("main");
    expect(refs).not.toContain("origin/main");
    expect(failures.join("\n")).toContain("main");
    expect(failures.join("\n")).not.toContain("origin/main");
  });

  test("passes when baseRef is head", async () => {
    expect(
      await collectForkBaseFailures(
        "/r",
        "origin",
        "main",
        probesFor("aaaaaaa1", "bbbbbbb2", "head"),
      ),
    ).toEqual([]);
  });
});

describe("collectMapStaleWarning (S18)", () => {
  test("warns when the map is missing", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "preflight-map-"));
    const warning = await collectMapStaleWarning(directory, "docs/agents/codebase.md");
    expect(warning).toContain("stale");
  });
});

function makeCheck(overrides: Partial<DependencyCheck>): DependencyCheck {
  return {
    dependency: "github-cli",
    status: "unsatisfied",
    summary: "gh not on PATH",
    remedy: [],
    limitation: null,
    ...overrides,
  };
}

const owner: WorktreeOwner = {
  runId: "run-a",
  ticket: "AO-259",
  anchorPid: 4242,
  at: "2026-09-07T20:00:00.000Z",
};

function buildOwnedEntry(reason: string): WorktreeEntry {
  return {
    directory: "/repo/.claude/worktrees/agent-abc",
    branch: "ao-259-forge-preflight-ownership-aware",
    lockedReason: reason,
  };
}

const ownedEntry = buildOwnedEntry(
  `forge run=${owner.runId} ticket=${owner.ticket} anchor=${owner.anchorPid} at=${owner.at}`,
);

describe("classifyWorktreeEntry", () => {
  test("detached worktree (no branch checked out) needs human review", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-abc",
      branch: null,
      lockedReason: null,
    };
    const verdict = classifyWorktreeEntry(entry, undefined, () => "dead");
    expect(verdict).toEqual({ kind: "detached", entry });
  });

  test("a live owner matching --run is a failure (own-run leftover)", () => {
    const verdict = classifyWorktreeEntry(ownedEntry, owner.runId, () => "live");
    expect(verdict).toEqual({
      kind: "own-run-leftover",
      entry: ownedEntry,
      owner,
    });
  });

  test("a live owner NOT matching --run is informational, not a failure", () => {
    const verdict = classifyWorktreeEntry(ownedEntry, "some-other-run", () => "live");
    expect(verdict).toEqual({
      kind: "other-run-live",
      entry: ownedEntry,
      owner,
    });
  });

  test("a live owner is informational when no --run was given at all", () => {
    const verdict = classifyWorktreeEntry(ownedEntry, undefined, () => "live");
    expect(verdict).toEqual({
      kind: "other-run-live",
      entry: ownedEntry,
      owner,
    });
  });

  test("an idle owner warns, regardless of --run", () => {
    const verdict = classifyWorktreeEntry(ownedEntry, owner.runId, () => "idle");
    expect(verdict).toEqual({ kind: "idle", entry: ownedEntry, owner });
  });

  test("a dead owner is reported as reclaimable, never a hard failure", () => {
    const verdict = classifyWorktreeEntry(ownedEntry, owner.runId, () => "dead");
    expect(verdict).toEqual({ kind: "dead", entry: ownedEntry, owner });
  });

  test("no /forge owner (an ordinary interactive worktree) falls back to content classification", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-xyz",
      branch: "feat/unrelated-feature-work",
      lockedReason: null,
    };
    const verdict = classifyWorktreeEntry(entry, undefined, () => "dead");
    expect(verdict).toEqual({
      kind: "content-fallback",
      entry,
      branch: "feat/unrelated-feature-work",
    });
  });

  test("an unlocked worktree also falls back to content classification", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-xyz",
      branch: "ao-1-something",
      lockedReason: null,
    };
    const verdict = classifyWorktreeEntry(entry, undefined, () => "dead");
    expect(verdict).toEqual({
      kind: "content-fallback",
      entry,
      branch: "ao-1-something",
    });
  });

  test("an injected resolveOwner (e.g. reservation fallback) is used instead of the raw lock", () => {
    const entry: WorktreeEntry = {
      /**
       * The harness unlocked this worktree — resolveWorktreeOwner alone
       * would return null and this would fall through to content-fallback.
       */
      directory: "/repo/.claude/worktrees/agent-abc",
      branch: "ao-259-forge-preflight-ownership-aware",
      lockedReason: null,
    };
    const verdict = classifyWorktreeEntry(
      entry,
      owner.runId,
      () => "live",
      () => owner,
    );
    expect(verdict).toEqual({ kind: "own-run-leftover", entry, owner });
  });
});

describe("checkSlotCapacity", () => {
  test("ok, not degraded, when at least waveSize slots are free", () => {
    const result = checkSlotCapacity(8, 4, (index) => index < 5);
    expect(result).toEqual({ freeCount: 5, cap: 8, waveSize: 4, ok: true, degraded: false });
  });

  test("ok, not degraded, at exactly the boundary (freeCount === waveSize)", () => {
    const result = checkSlotCapacity(8, 4, (index) => index < 4);
    expect(result).toEqual({ freeCount: 4, cap: 8, waveSize: 4, ok: true, degraded: false });
  });

  /**
   * The behavior this replaces: 5 busy slots out of 8 used to hard-fail a
   * wave of even one ticket. A partial wave can still dispatch — it's ok,
   * just degraded — since `acquireSlot` already drops only the tickets that
   * can't get a slot, not the whole wave.
   */
  test("ok but degraded when fewer than waveSize slots are free (and at least one is)", () => {
    const result = checkSlotCapacity(8, 4, (index) => index < 3);
    expect(result).toEqual({ freeCount: 3, cap: 8, waveSize: 4, ok: true, degraded: true });
  });

  test("fails (not merely degraded) when every slot is exhausted", () => {
    const result = checkSlotCapacity(8, 4, () => false);
    expect(result).toEqual({ freeCount: 0, cap: 8, waveSize: 4, ok: false, degraded: false });
  });

  test("ok, not degraded, when every slot is free", () => {
    const result = checkSlotCapacity(8, 4, () => true);
    expect(result).toEqual({ freeCount: 8, cap: 8, waveSize: 4, ok: true, degraded: false });
  });

  test("degraded even with a single free slot out of a large cap", () => {
    const result = checkSlotCapacity(16, 4, (index) => index === 0);
    expect(result).toEqual({ freeCount: 1, cap: 16, waveSize: 4, ok: true, degraded: true });
  });
});

function lockedFor(
  directory: string,
  branch: string,
  ticket: string,
  runId = "run-a",
): WorktreeEntry {
  return {
    directory,
    branch,
    lockedReason: `forge run=${runId} ticket=${ticket} anchor=4242 at=2026-09-11T00:00:00.000Z`,
    head: "abc123",
  };
}

describe("isBranchMatchingTicket", () => {
  test("keeps the numeric match when the prefix differs from the ticket key", () => {
    expect(isBranchMatchingTicket("ticket-258-login", "AO-258", "ticket")).toBe(true);
  });

  test("matches the ticket number as a branch prefix", () => {
    expect(isBranchMatchingTicket("ao-321-worktree-lock-guard", "AO-321", "ao")).toBe(true);
  });

  test("matches a bare <prefix>-<n> branch with no slug", () => {
    expect(isBranchMatchingTicket("ao-321", "AO-321", "ao")).toBe(true);
  });

  test("rejects a different ticket number", () => {
    expect(isBranchMatchingTicket("ao-284-starred-page", "AO-285", "ao")).toBe(false);
  });

  test("rejects a prefix collision (ao-32 vs ao-321)", () => {
    expect(isBranchMatchingTicket("ao-321-worktree-lock-guard", "AO-32", "ao")).toBe(false);
  });

  test("rejects a non-<PREFIX>-<digits> ticket shape", () => {
    expect(isBranchMatchingTicket("ao-321-something", "not-a-ticket", "ao")).toBe(false);
  });

  /**
   * The regression the required `branchPrefix` argument exists to prevent:
   * this used to default to `'ao'`, so a repo whose own prefix is `nfk`
   * reported every correctly-named branch as a ticket mismatch.
   */
  test("compares the full ticket id for slug-prefixed ids", () => {
    expect(
      isBranchMatchingTicket("forge-local-tracker-03-parser", "local-tracker-03", "forge"),
    ).toBe(true);
    expect(isBranchMatchingTicket("forge-local-tracker-03", "local-tracker-03", "forge")).toBe(
      true,
    );
    expect(isBranchMatchingTicket("forge-other-spec-03-parser", "local-tracker-03", "forge")).toBe(
      false,
    );
    expect(isBranchMatchingTicket("forge-03-parser", "local-tracker-03", "forge")).toBe(false);
  });

  test("specs a and b with ticket 01 report no mismatch or duplicate", () => {
    const entryA = lockedFor("/repo/.claude/worktrees/agent-a", "forge-a-01-x", "a-01");
    const entryB = lockedFor("/repo/.claude/worktrees/agent-b", "forge-b-01-y", "b-01");
    expect(findBranchTicketMismatches([entryA, entryB], "forge")).toEqual([]);
    expect(findDuplicateTicketBranchNumbers(["forge-a-01-x", "forge-b-01-y"], "forge").size).toBe(
      0,
    );
  });

  test("honors a repo's own branchPrefix rather than any built-in default", () => {
    expect(isBranchMatchingTicket("nfk-42-login", "NFK-42", "nfk")).toBe(true);
    expect(isBranchMatchingTicket("nfk-42-login", "NFK-42", "ao")).toBe(false);
  });
});

describe("findDuplicateTicketWorktrees", () => {
  test("finds two worktrees claiming the same ticket", () => {
    const first = lockedFor("/repo/.claude/worktrees/agent-a", "ao-284-starred-page", "AO-284");
    const second = lockedFor(
      "/repo/.claude/worktrees/agent-b",
      "ao-284-starred-page-fixes",
      "AO-284",
    );
    const duplicates = findDuplicateTicketWorktrees([first, second]);
    expect(duplicates.get("AO-284")).toEqual([first, second]);
  });

  test("a single worktree per ticket is never reported", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-284-starred-page", "AO-284");
    expect(findDuplicateTicketWorktrees([entry]).size).toBe(0);
  });

  test("an unlocked or non-/forge-locked entry is never grouped", () => {
    const unlocked: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-a",
      branch: "ao-1-something",
      lockedReason: null,
    };
    const humanLocked: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-b",
      branch: "ao-1-something-else",
      lockedReason: "do not touch, debugging",
    };
    expect(findDuplicateTicketWorktrees([unlocked, humanLocked]).size).toBe(0);
  });
});

describe("findDuplicateTicketBranchNumbers", () => {
  test("groups two branches of the same slug-style ticket and keeps distinct tickets apart", () => {
    const duplicates = findDuplicateTicketBranchNumbers(
      ["forge-a-01-x", "forge-a-01-y", "forge-a-02-z", "forge-b-01-w"],
      "forge",
    );
    expect(duplicates.get("a-01")).toEqual(["forge-a-01-x", "forge-a-01-y"]);
    expect(duplicates.size).toBe(1);
  });

  test("finds two branches for the same ticket number", () => {
    const duplicates = findDuplicateTicketBranchNumbers(
      ["ao-284-starred-page", "ao-284-starred-page-fixes", "ao-285-unrelated"],
      "ao",
    );
    expect(duplicates.get("284")).toEqual(["ao-284-starred-page", "ao-284-starred-page-fixes"]);
    expect(duplicates.has("285")).toBe(false);
  });

  test("a branch name with no numeric ticket id is ignored", () => {
    expect(findDuplicateTicketBranchNumbers(["ao--no-number"], "ao").size).toBe(0);
  });

  test("only groups branches under the repo's own prefix", () => {
    const duplicates = findDuplicateTicketBranchNumbers(
      ["nfk-7-a", "nfk-7-b", "ao-7-unrelated-repo-leftover"],
      "nfk",
    );
    expect(duplicates.get("7")).toEqual(["nfk-7-a", "nfk-7-b"]);
  });
});

describe("findWorktreesMissingLockPastDeadline", () => {
  const now = 1_000_000;

  test("flags an unlocked entry older than maxAgeMs", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-stale",
      branch: null,
      lockedReason: null,
    };
    const result = findWorktreesMissingLockPastDeadline([entry], 30_000, now, () => now - 60_000);
    expect(result).toEqual([entry]);
  });

  test("does not flag an unlocked entry younger than maxAgeMs", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-fresh",
      branch: null,
      lockedReason: null,
    };
    const result = findWorktreesMissingLockPastDeadline([entry], 30_000, now, () => now - 5000);
    expect(result).toEqual([]);
  });

  test("never flags a locked entry, regardless of age", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-1-something", "AO-1");
    const result = findWorktreesMissingLockPastDeadline([entry], 30_000, now, () => now - 999_999);
    expect(result).toEqual([]);
  });

  test("skips an entry whose mtime cannot be read", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-gone",
      branch: null,
      lockedReason: null,
    };
    const result = findWorktreesMissingLockPastDeadline([entry], 30_000, now, () => null);
    expect(result).toEqual([]);
  });
});

describe("auditPostDispatch", () => {
  const baseOptions = {
    maxUnlockedAgeMs: 30_000,
    nowMs: 1_000_000,
    statMtimeMs: () => 1_000_000 - 5000,
    branchPrefix: "ao",
  };

  test("a clean dispatch reports no failures", () => {
    const entry = lockedFor(
      "/repo/.claude/worktrees/agent-a",
      "ao-321-worktree-lock-guard",
      "AO-321",
    );
    const failures = auditPostDispatch([entry], ["ao-321-worktree-lock-guard"], baseOptions);
    expect(failures).toEqual([]);
  });

  test("reports a duplicate-ticket worktree", () => {
    const first = lockedFor("/repo/.claude/worktrees/agent-a", "ao-284-starred-page", "AO-284");
    const second = lockedFor(
      "/repo/.claude/worktrees/agent-b",
      "ao-284-starred-page-fixes",
      "AO-284",
    );
    const failures = auditPostDispatch(
      [first, second],
      ["ao-284-starred-page", "ao-284-starred-page-fixes"],
      baseOptions,
    );
    expect(failures).toEqual([
      expect.objectContaining({ kind: "duplicate-ticket-worktree" }),
      expect.objectContaining({ kind: "duplicate-ticket-branch-number" }),
    ]);
  });

  test("reports an unlocked worktree past the deadline", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-stale",
      branch: null,
      lockedReason: null,
    };
    const failures = auditPostDispatch([entry], [], {
      ...baseOptions,
      statMtimeMs: () => 1_000_000 - 60_000,
    });
    expect(failures).toEqual([expect.objectContaining({ kind: "unlocked-past-deadline" })]);
  });

  test("reports a branch that does not match its own lock ticket", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-999-wrong-branch", "AO-321");
    const failures = auditPostDispatch([entry], ["ao-999-wrong-branch"], baseOptions);
    expect(failures).toEqual([expect.objectContaining({ kind: "branch-ticket-mismatch" })]);
  });
});

describe("findBranchTicketMismatches", () => {
  test("empty when every entry's branch matches its own lock ticket", () => {
    const entry = lockedFor(
      "/repo/.claude/worktrees/agent-a",
      "ao-321-worktree-lock-guard",
      "AO-321",
    );
    expect(findBranchTicketMismatches([entry], "ao")).toEqual([]);
  });

  test("reports a branch that does not match its own lock ticket", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-999-wrong-branch", "AO-321");
    expect(findBranchTicketMismatches([entry], "ao")).toEqual([
      expect.objectContaining({ kind: "branch-ticket-mismatch" }),
    ]);
  });

  test("skips an unlocked or detached entry — nothing to compare", () => {
    const unlocked: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-a",
      branch: "ao-1-something",
      lockedReason: null,
    };
    const detached: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-b",
      branch: null,
      lockedReason: `forge run=run-a ticket=AO-1 anchor=4242 at=2026-09-11T00:00:00.000Z`,
    };
    expect(findBranchTicketMismatches([unlocked, detached], "ao")).toEqual([]);
  });

  test("tolerates its own scaffold branch still on the recently-locked worktree (bootstrap race)", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-abc",
      branch: "worktree-agent-abc",
      lockedReason: `forge run=run-a ticket=AO-321 anchor=4242 at=2026-09-11T00:00:00.000Z`,
    };
    expect(
      findBranchTicketMismatches([entry], "ao", {
        nowMs: Date.parse("2026-09-11T00:00:10.000Z"),
        maxAgeMs: 30_000,
      }),
    ).toEqual([]);
  });

  test("a stale scaffold branch past maxAgeMs is still reported", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-abc",
      branch: "worktree-agent-abc",
      lockedReason: `forge run=run-a ticket=AO-321 anchor=4242 at=2026-09-11T00:00:00.000Z`,
    };
    expect(
      findBranchTicketMismatches([entry], "ao", {
        nowMs: Date.parse("2026-09-11T00:01:00.000Z"),
        maxAgeMs: 30_000,
      }),
    ).toEqual([expect.objectContaining({ kind: "branch-ticket-mismatch" })]);
  });

  test("a scaffold branch belonging to a DIFFERENT worktree is still a mismatch", () => {
    const entry: WorktreeEntry = {
      directory: "/repo/.claude/worktrees/agent-abc",
      branch: "worktree-agent-xyz",
      lockedReason: `forge run=run-a ticket=AO-321 anchor=4242 at=2026-09-11T00:00:00.000Z`,
    };
    expect(
      findBranchTicketMismatches([entry], "ao", {
        nowMs: Date.parse("2026-09-11T00:00:01.000Z"),
        maxAgeMs: 30_000,
      }),
    ).toEqual([expect.objectContaining({ kind: "branch-ticket-mismatch" })]);
  });
});

describe("findMissingTicketsForRun", () => {
  test("empty when every expected ticket has a matching mine-entry", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-1-something", "AO-1");
    expect(findMissingTicketsForRun([entry], ["AO-1"])).toEqual([]);
  });

  test("reports every expected ticket with no matching entry", () => {
    const entry = lockedFor("/repo/.claude/worktrees/agent-a", "ao-1-something", "AO-1");
    expect(findMissingTicketsForRun([entry], ["AO-1", "AO-2", "AO-3"])).toEqual(["AO-2", "AO-3"]);
  });

  test("reports every expected ticket when no entries are attributed at all", () => {
    expect(findMissingTicketsForRun([], ["AO-1", "AO-2"])).toEqual(["AO-1", "AO-2"]);
  });
});

describe("findTodoMarkers", () => {
  test("finds a marker and reports its file and line number", () => {
    const content = [
      "# Worktree setup",
      "",
      "TODO(forge): describe the shared singleton resource here.",
      "",
      "More prose.",
    ].join("\n");
    expect(findTodoMarkers("docs/agents/forge.md", content)).toEqual([
      "docs/agents/forge.md:3: TODO(forge): describe the shared singleton resource here.",
    ]);
  });

  test("finds every marker, in order", () => {
    const content = "TODO(forge): a\nsomething else\nTODO(forge): b";
    expect(findTodoMarkers("domain.md", content)).toEqual([
      "domain.md:1: TODO(forge): a",
      "domain.md:3: TODO(forge): b",
    ]);
  });

  test("returns an empty array when there is no marker", () => {
    expect(findTodoMarkers("forge.md", "# All set\n\nNo markers here.")).toEqual([]);
  });

  test('does not match a bare "TODO:" without the (forge) tag', () => {
    expect(findTodoMarkers("forge.md", "TODO: unrelated, not ours to gate on")).toEqual([]);
  });

  /**
   * Regression test: `forge.md.tpl`'s own boilerplate footer once described
   * the `TODO(forge):` convention using the literal string itself (e.g.
   * "`forge preflight` blocks dispatch while any `TODO(forge):` marker
   * remains"), which made that explanatory prose match its own gate forever
   * — no repo generated from that template could ever pass preflight, since
   * the boilerplate is meant to stay. Every template's prose must describe
   * the marker without spelling out the exact matched string.
   */
  test("every doc template has exactly its intentional markers — none from its own explanatory prose", () => {
    const templatesDirectory = path.join(import.meta.dir, "..", "templates");
    const expectedMarkerCounts: Record<string, number> = {
      "forge.md.tpl": 3,
      "issue-tracker-linear.md.tpl": 2,
      "issue-tracker-github.md.tpl": 1,
      "issue-tracker-local.md.tpl": 0,
      "triage-labels-linear.md.tpl": 1,
      "triage-labels-github.md.tpl": 1,
      "triage-labels-local.md.tpl": 0,
      "domain.md.tpl": 0,
    };
    for (const [fileName, expectedCount] of Object.entries(expectedMarkerCounts)) {
      const content = readFileSync(path.join(templatesDirectory, fileName), "utf8");
      expect(findTodoMarkers(fileName, content).length).toBe(expectedCount);
    }
  });
});

describe("evaluateDependencyGate", () => {
  test("an unsatisfied check fails dispatch by default", () => {
    const gate = evaluateDependencyGate([makeCheck({ status: "unsatisfied" })], { skip: false });
    expect(gate.failures).toEqual(["gh not on PATH"]);
    expect(gate.warnings).toEqual([]);
  });

  test("an indeterminate check only ever warns, never blocks", () => {
    const gate = evaluateDependencyGate(
      [makeCheck({ status: "indeterminate", summary: "gh auth status timed out" })],
      { skip: false },
    );
    expect(gate.failures).toEqual([]);
    expect(gate.warnings).toEqual(["gh auth status timed out"]);
  });

  test("a satisfied check produces neither a failure nor a warning", () => {
    const gate = evaluateDependencyGate([makeCheck({ status: "satisfied", summary: "gh OK" })], {
      skip: false,
    });
    expect(gate.failures).toEqual([]);
    expect(gate.warnings).toEqual([]);
  });

  test("skip: true downgrades an unsatisfied check to a warning, stating why", () => {
    const gate = evaluateDependencyGate([makeCheck({ status: "unsatisfied" })], { skip: true });
    expect(gate.failures).toEqual([]);
    expect(gate.warnings).toEqual(["gh not on PATH — downgraded by FORGE_SKIP_DEPENDENCY_CHECKS"]);
  });
});

describe("findMissingRequiredCommands", () => {
  test("reports a binary that does not resolve", async () => {
    const missing = await findMissingRequiredCommands(
      ["rg", "sg"],
      new Set(),
      async (binary) => binary === "rg",
    );
    expect(missing).toEqual(["sg"]);
  });

  test("skips a binary a dependency check already covers", async () => {
    const missing = await findMissingRequiredCommands(
      ["gh", "rg"],
      new Set(["gh"]),
      async () => false,
    );
    expect(missing).toEqual(["rg"]);
  });

  test("empty when every command resolves", async () => {
    const missing = await findMissingRequiredCommands(["rg"], new Set(), async () => true);
    expect(missing).toEqual([]);
  });
});

describe("collectDependencyChecks (S10)", () => {
  const absentGithubCliProbes: DependencyProbes = {
    claudePlugin: async () => ({ kind: "listed", status: "installed" }),
    githubCli: async () => ({ kind: "not-on-path" }),
    linearMcpServer: async () => ({ kind: "declared", source: "mcp-json" }),
    forgeAgents: async () => ({ kind: "present" }),
  };

  test("emits no github-cli check when gh is absent, tracker local, landing merge", async () => {
    const checks = await collectDependencyChecks(
      { ...DEFAULT_FORGE_CONFIG, tracker: { kind: "local" }, landing: { mode: "merge" } },
      "/r",
      absentGithubCliProbes,
    );
    expect(checks.map((check) => check.dependency)).not.toContain("github-cli");
  });

  test("still probes gh when landing mode is pr", async () => {
    const checks = await collectDependencyChecks(
      { ...DEFAULT_FORGE_CONFIG, tracker: { kind: "local" }, landing: { mode: "pr" } },
      "/r",
      absentGithubCliProbes,
    );
    expect(checks.map((check) => check.dependency)).toContain("github-cli");
  });
});

describe("DEPRECATED_CONFIG_FIELDS", () => {
  test("lists the twelve unread fields", () => {
    expect(DEPRECATED_CONFIG_FIELDS).toHaveLength(12);
    expect(DEPRECATED_CONFIG_FIELDS).toContain("tracker.readyLabel");
  });
});
