import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  checkBackgroundBashInWorktree,
  checkCodeReviewFanoutWithSiblingRun,
  checkSessionStop,
  checkSubagentStop,
  evaluateStopGuard,
  recordCompletionEvent,
  type CompletionEventDependencies,
  finalReportMarkerPath,
  formatStopOutput,
  isValidSessionId,
  readBoundedStdin,
  readHandoffNotes,
  type SessionStopDependencies,
  type StopHookInput,
  checkScheduleWakeupSlashCommand,
  collectProcessAncestry,
  evaluateGuard,
  hasLiveSiblingRun,
  readParentPid,
  run as runGuard,
  type PreToolUseHookInput,
} from "./guard";
import { readPhase } from "./phase";
import type { SlotHolder } from "./slots";

function makeHolder(overrides: Partial<SlotHolder> = {}): SlotHolder {
  return {
    pid: 1000,
    worktree: "/repo",
    acquiredAt: Date.now(),
    runId: "run-a",
    anchorPid: 1000,
    ticket: "AO-1",
    sessionSlug: "-home-user-repo",
    repoRoot: "/repo",
    ...overrides,
  };
}

describe("checkBackgroundBashInWorktree", () => {
  test("denies a backgrounded Bash call from inside an agent worktree", () => {
    const input: PreToolUseHookInput = {
      tool_name: "Bash",
      cwd: "/repo/.claude/worktrees/agent-abc",
      tool_input: { run_in_background: true },
    };
    expect(checkBackgroundBashInWorktree(input).decision).toBe("deny");
  });

  test("allows a foreground Bash call from inside an agent worktree", () => {
    const input: PreToolUseHookInput = {
      tool_name: "Bash",
      cwd: "/repo/.claude/worktrees/agent-abc",
      tool_input: { run_in_background: false },
    };
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: "allow" });
  });

  test("allows a backgrounded Bash call from an ordinary (non-worker) cwd", () => {
    const input: PreToolUseHookInput = {
      tool_name: "Bash",
      cwd: "/home/user/code/some-repo",
      tool_input: { run_in_background: true },
    };
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: "allow" });
  });

  test("ignores every other tool", () => {
    const input: PreToolUseHookInput = {
      tool_name: "ScheduleWakeup",
      cwd: "/repo/.claude/worktrees/agent-abc",
      tool_input: { run_in_background: true },
    };
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: "allow" });
  });
});

describe("checkScheduleWakeupSlashCommand", () => {
  test("denies a /forge prompt", () => {
    const input: PreToolUseHookInput = {
      tool_name: "ScheduleWakeup",
      tool_input: { prompt: "/forge --dispatch AO-565" },
    };
    expect(checkScheduleWakeupSlashCommand(input).decision).toBe("deny");
  });

  test("denies a /forge prompt with leading whitespace", () => {
    const input: PreToolUseHookInput = {
      tool_name: "ScheduleWakeup",
      tool_input: { prompt: "  /forge --dispatch AO-565" },
    };
    expect(checkScheduleWakeupSlashCommand(input).decision).toBe("deny");
  });

  test("denies an /emet prompt and names the emet binary", () => {
    const verdict = checkScheduleWakeupSlashCommand({
      tool_name: "ScheduleWakeup",
      tool_input: { prompt: "/emet:run --dispatch AO-565" },
    });
    expect(verdict.decision === "deny" ? verdict.reason : "").toMatch(/^emet guard: /);
  });

  test("allows an ordinary resume-note prompt", () => {
    const input: PreToolUseHookInput = {
      tool_name: "ScheduleWakeup",
      tool_input: { prompt: "resume wave close-out for run ao550" },
    };
    expect(checkScheduleWakeupSlashCommand(input)).toEqual({ decision: "allow" });
  });

  test("ignores every other tool", () => {
    const input: PreToolUseHookInput = {
      tool_name: "Bash",
      tool_input: { prompt: "/forge --dispatch AO-565" },
    };
    expect(checkScheduleWakeupSlashCommand(input)).toEqual({ decision: "allow" });
  });
});

describe("readParentPid", () => {
  test("parses ppid out of a well-formed /proc/<pid>/stat line", () => {
    const stat = "1234 (bun) S 999 1234 1234 0 -1 4194560 ...";
    expect(readParentPid(1234, () => stat)).toBe(999);
  });

  test('handles a process name containing a literal ")"', () => {
    const stat = "1234 (weird ) name) S 5555 1234 1234 0 -1 4194560";
    expect(readParentPid(1234, () => stat)).toBe(5555);
  });

  test("returns null when the file is unreadable", () => {
    expect(
      readParentPid(1234, () => {
        throw new Error("ENOENT");
      }),
    ).toBeNull();
  });

  test("returns null for a malformed line", () => {
    expect(readParentPid(1234, () => "1234 (bun)")).toBeNull();
  });
});

describe("collectProcessAncestry", () => {
  test("walks up to pid 1 and stops", () => {
    const parents: Record<number, number> = { 500: 400, 400: 300, 300: 1 };
    const ancestry = collectProcessAncestry(500, (pid) => parents[pid] ?? null);
    expect(ancestry).toEqual([500, 400, 300]);
  });

  test("stops when a hop reports no parent", () => {
    const ancestry = collectProcessAncestry(500, () => null);
    expect(ancestry).toEqual([500]);
  });

  test("never loops forever on a self-referential parent", () => {
    const ancestry = collectProcessAncestry(500, () => 500);
    expect(ancestry).toEqual([500]);
  });
});

describe("hasLiveSiblingRun", () => {
  test("true when a live slot is held by an anchorPid outside this ancestry", () => {
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: "live" as const },
    ];
    expect(hasLiveSiblingRun(entries, [111, 222])).toBe(true);
  });

  test("false when the only live slot is this run's own", () => {
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 111 }), verdict: "live" as const },
    ];
    expect(hasLiveSiblingRun(entries, [111, 222])).toBe(false);
  });

  test("false when the sibling slot is dead, not live", () => {
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: "dead" as const },
    ];
    expect(hasLiveSiblingRun(entries, [111])).toBe(false);
  });

  test("false with no occupied slots at all", () => {
    expect(hasLiveSiblingRun([], [111])).toBe(false);
  });
});

describe("checkCodeReviewFanoutWithSiblingRun", () => {
  test("denies code-review when a live sibling run holds a slot", async () => {
    const input: PreToolUseHookInput = { tool_name: "Skill", tool_input: { skill: "code-review" } };
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: "live" as const },
    ];
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, () =>
      Promise.resolve(entries),
    );
    expect(verdict.decision).toBe("deny");
  });

  test("allows code-review when no sibling run is live", async () => {
    const input: PreToolUseHookInput = { tool_name: "Skill", tool_input: { skill: "code-review" } };
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, () =>
      Promise.resolve([]),
    );
    expect(verdict).toEqual({ decision: "allow" });
  });

  test("matches a plugin-scoped skill name", async () => {
    const input: PreToolUseHookInput = {
      tool_name: "Skill",
      tool_input: { skill: "mattpocock-skills:code-review" },
    };
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: "live" as const },
    ];
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, () =>
      Promise.resolve(entries),
    );
    expect(verdict.decision).toBe("deny");
  });

  test("ignores every other skill", async () => {
    const input: PreToolUseHookInput = { tool_name: "Skill", tool_input: { skill: "simplify" } };
    const entries = [
      { index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: "live" as const },
    ];
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, () =>
      Promise.resolve(entries),
    );
    expect(verdict).toEqual({ decision: "allow" });
  });
});

describe("evaluateGuard", () => {
  test("allows an ordinary tool call with nothing to flag", async () => {
    const input: PreToolUseHookInput = { tool_name: "Read", tool_input: { file_path: "/x" } };
    expect(await evaluateGuard(input, process.pid)).toEqual({ decision: "allow" });
  });

  test("never throws on a malformed input shape", async () => {
    const input = {} as PreToolUseHookInput;
    const verdict = await evaluateGuard(input, process.pid);
    expect(verdict).toEqual({ decision: "allow" });
  });
});

const subagentDeps = (commits: number | null, notes: string[]) => ({
  countNewCommits: () => Promise.resolve(commits),
  readHandoffNotes: () => notes,
});

function streamOf(text: string): ReadableStream<Uint8Array> {
  const { body } = new Response(text);
  if (body === null) throw new Error("response has no body");
  return body;
}

const eventDeps = (
  written: unknown[],
  overrides: Partial<CompletionEventDependencies> = {},
): CompletionEventDependencies => ({
  resolveOwner: () => Promise.resolve({ runId: "run-a", ticket: "CLA-50", branch: "cla-50-x" }),
  resolveCommonDirectory: () => Promise.resolve("/repo/.git"),
  countNewCommits: () => Promise.resolve(3),
  writeEvent: (_commonDirectory, event) => {
    written.push(event);
  },
  now: () => new Date("2026-11-03T00:00:00.000Z"),
  ...overrides,
});

describe("stop hooks", () => {
  const worktreeCwd = "/repo/.claude/worktrees/agent-abc";
  const noteWithState = "state: implementing\n";

  test("SubagentStop blocks without a commit, then allows on stop_hook_active", async () => {
    const input: StopHookInput = { cwd: worktreeCwd };
    const blocked = await checkSubagentStop(input, subagentDeps(0, [noteWithState]));
    expect(blocked.decision).toBe("block");
    const second = await checkSubagentStop(
      { ...input, stop_hook_active: true },
      subagentDeps(0, []),
    );
    expect(second.decision).toBe("allow");
  });

  test("SubagentStop blocks when the handoff has no state", async () => {
    const withoutState = await checkSubagentStop(
      { cwd: worktreeCwd },
      subagentDeps(2, ["notes: x\n"]),
    );
    expect(withoutState.decision).toBe("block");
    const noNote = await checkSubagentStop({ cwd: worktreeCwd }, subagentDeps(2, []));
    expect(noNote.decision).toBe("block");
  });

  test("SubagentStop allows with a commit and state, and outside worktrees", async () => {
    const complete = await checkSubagentStop(
      { cwd: worktreeCwd },
      subagentDeps(1, [noteWithState]),
    );
    expect(complete.decision).toBe("allow");
    const outside = await checkSubagentStop({ cwd: "/home/u/repo" }, subagentDeps(0, []));
    expect(outside.decision).toBe("allow");
  });

  for (const runDirectory of [".emet", ".forge"]) {
    test(`readHandoffNotes reads the handoff note from ${runDirectory}/`, () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "emet-guard-handoff-"));
      try {
        const cwd = path.join(root, ".claude", "worktrees", "agent-abc");
        mkdirSync(path.join(cwd, runDirectory), { recursive: true });
        writeFileSync(path.join(cwd, runDirectory, "handoff-CLA-1.md"), noteWithState);
        expect(readHandoffNotes(cwd)).toEqual([noteWithState]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test("SubagentStop names the emet binary when it blocks", async () => {
    const verdict = await checkSubagentStop({ cwd: worktreeCwd }, subagentDeps(0, []));
    expect(verdict.decision === "block" ? verdict.reason : "").toMatch(/^emet guard: /);
  });

  test("records the subagent transcript path when the hook provides one", async () => {
    const written: unknown[] = [];
    await recordCompletionEvent(
      "SubagentStop",
      { cwd: worktreeCwd, session_id: "s1", agent_transcript_path: "/t/agent-a1.jsonl" },
      { decision: "allow" },
      eventDeps(written),
    );
    expect(written[0]).toMatchObject({ agentTranscriptPath: "/t/agent-a1.jsonl" });
  });

  test("records an allowed completion event for a forge-owned worktree", async () => {
    const written: unknown[] = [];
    await recordCompletionEvent(
      "SubagentStop",
      { cwd: worktreeCwd, session_id: "s1" },
      { decision: "allow" },
      eventDeps(written),
    );
    expect(written).toEqual([
      {
        runId: "run-a",
        ticket: "CLA-50",
        event: "SubagentStop",
        outcome: "allowed",
        at: "2026-11-03T00:00:00.000Z",
        sessionId: "s1",
        branch: "cla-50-x",
        commits: 3,
      },
    ]);
  });

  test("records blocked outcome and a null commit probe as such", async () => {
    const written: unknown[] = [];
    await recordCompletionEvent(
      "Stop",
      { cwd: worktreeCwd },
      { decision: "block", reason: "x" },
      eventDeps(written, { countNewCommits: () => Promise.resolve(null) }),
    );
    expect(written[0]).toMatchObject({ outcome: "blocked", commits: null, sessionId: null });
  });

  test("records nothing when the cwd is not a forge-owned worktree, and never throws", async () => {
    const written: unknown[] = [];
    await recordCompletionEvent(
      "SubagentStop",
      { cwd: "/home/u/repo" },
      { decision: "allow" },
      eventDeps(written, { resolveOwner: () => Promise.resolve(null) }),
    );
    expect(written).toEqual([]);
    await recordCompletionEvent(
      "SubagentStop",
      { cwd: worktreeCwd },
      { decision: "allow" },
      eventDeps(written, {
        writeEvent: () => {
          throw new Error("disk full");
        },
      }),
    );
  });

  test("evaluateStopGuard still returns the verdict when recording fails", async () => {
    const verdict = await evaluateStopGuard("SubagentStop", { cwd: "/home/u/repo" }, process.pid);
    expect(verdict.decision).toBe("allow");
  });

  const holder = makeHolder({ anchorPid: 500 });
  const sessionDeps = (
    overrides: Partial<SessionStopDependencies> = {},
  ): SessionStopDependencies => ({
    listSlots: () => Promise.resolve([{ index: 0, holder, verdict: "live" }]),
    listClaims: () => Promise.resolve([]),
    markerExists: () => false,
    ...overrides,
  });

  const heldClaim = { runId: "r", anchorPid: 500, ticket: "AO-1", reservedAt: 0, sessionSlug: "s" };

  test("Stop allows while a worker slot is held, even with claims", async () => {
    const deps = sessionDeps({ listClaims: () => Promise.resolve([heldClaim]) });
    expect((await checkSessionStop({ session_id: "sess-1" }, [10, 500], deps)).decision).toBe(
      "allow",
    );
  });

  test("Stop blocks once when claims remain, no worker is in flight and no marker exists", async () => {
    const input: StopHookInput = { session_id: "sess-1" };
    const deps = sessionDeps({
      listSlots: () => Promise.resolve([]),
      listClaims: () => Promise.resolve([heldClaim]),
    });
    expect((await checkSessionStop(input, [10, 500], deps)).decision).toBe("block");
    const second = await checkSessionStop({ ...input, stop_hook_active: true }, [10, 500], deps);
    expect(second.decision).toBe("allow");
  });

  test("Stop blocks on a held claim alone", async () => {
    const deps = sessionDeps({
      listSlots: () => Promise.resolve([]),
      listClaims: () => Promise.resolve([heldClaim]),
    });
    expect((await checkSessionStop({ session_id: "sess-1" }, [500], deps)).decision).toBe("block");
  });

  test("Stop allows with a marker, without a held run, or with a bad session id", async () => {
    const input: StopHookInput = { session_id: "sess-1" };
    const claimsOnly = {
      listSlots: () => Promise.resolve([]),
      listClaims: () => Promise.resolve([heldClaim]),
    };
    const marked = await checkSessionStop(
      input,
      [500],
      sessionDeps({ ...claimsOnly, markerExists: () => true }),
    );
    expect(marked.decision).toBe("allow");
    expect((await checkSessionStop(input, [999], sessionDeps(claimsOnly))).decision).toBe("allow");
    const badId = await checkSessionStop(
      { session_id: "../etc/passwd" },
      [500],
      sessionDeps(claimsOnly),
    );
    expect(badId.decision).toBe("allow");
  });

  test("finalReportMarkerPath defaults to the emet state dir", () => {
    const previous = process.env.EMET_STATE_DIR;
    process.env.EMET_STATE_DIR = "/state/emet";
    try {
      expect(finalReportMarkerPath("s1")).toBe("/state/emet/final-report/s1");
    } finally {
      if (previous === undefined) delete process.env.EMET_STATE_DIR;
      else process.env.EMET_STATE_DIR = previous;
    }
  });

  test("isValidSessionId rejects path traversal", () => {
    expect(isValidSessionId("abc-123_X")).toBe(true);
    expect(isValidSessionId("../x")).toBe(false);
    expect(isValidSessionId("a/b")).toBe(false);
    expect(isValidSessionId("")).toBe(false);
    expect(() => finalReportMarkerPath("../x", "/tmp")).toThrow();
  });

  test("readBoundedStdin returns null past the limit", async () => {
    expect(await readBoundedStdin(streamOf("hello"), 10)).toBe("hello");
    expect(await readBoundedStdin(streamOf("x".repeat(50)), 10)).toBeNull();
  });

  test("formatStopOutput emits a block payload only on block", () => {
    expect(formatStopOutput({ decision: "allow" })).toBeNull();
    const output = formatStopOutput({ decision: "block", reason: "r" });
    expect(JSON.parse(output!)).toEqual({ decision: "block", reason: "r" });
  });
});

describe("evaluateGuard destructive commands", () => {
  test("denies a wrapped destructive Bash command", async () => {
    const verdict = await evaluateGuard(
      { tool_name: "Bash", cwd: "/tmp", tool_input: { command: 'sudo sh -c "git reset --hard"' } },
      process.pid,
    );
    expect(verdict.decision).toBe("deny");
  });
  test("allows a benign look-alike", async () => {
    const verdict = await evaluateGuard(
      { tool_name: "Bash", cwd: "/tmp", tool_input: { command: "git reset --soft HEAD~1" } },
      process.pid,
    );
    expect(verdict.decision).toBe("allow");
  });
});

async function markIn(argv: string[]): Promise<{ root: string; state: string }> {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "guard-phase-")));
  const state = path.join(root, "state");
  Bun.spawnSync(["git", "init", "-q", root]);
  const previousDirectory = process.cwd();
  const previousState = process.env.EMET_STATE_DIR;
  const originalLog = console.log;
  process.env.EMET_STATE_DIR = state;
  console.log = () => undefined;
  try {
    process.chdir(root);
    await runGuard(argv);
  } finally {
    console.log = originalLog;
    process.chdir(previousDirectory);
    if (previousState === undefined) delete process.env.EMET_STATE_DIR;
    else process.env.EMET_STATE_DIR = previousState;
  }
  return { root, state };
}

describe("--mark-final-report phase file", () => {
  test("writes done by default and failed with --failed", async () => {
    const done = await markIn(["--mark-final-report", "sess-1"]);
    expect(readPhase(done.root)?.phase).toBe("done");
    const failed = await markIn(["--mark-final-report", "sess-2", "--failed"]);
    expect(readPhase(failed.root)?.phase).toBe("failed");
  });

  test("an unwritable phase file does not change the exit code or the marker", async () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "guard-phase-")));
    mkdirSync(path.join(root, ".emet", "phase.json"), { recursive: true });
    Bun.spawnSync(["git", "init", "-q", root]);
    const previousDirectory = process.cwd();
    const previousState = process.env.EMET_STATE_DIR;
    const previousExit = process.exitCode;
    const originalLog = console.log;
    process.env.EMET_STATE_DIR = path.join(root, "state");
    console.log = () => undefined;
    try {
      process.chdir(root);
      process.exitCode = 0;
      await runGuard(["--mark-final-report", "sess-3"]);
      expect(process.exitCode).toBe(0);
      expect(existsSync(path.join(root, "state", "final-report", "sess-3"))).toBe(true);
    } finally {
      console.log = originalLog;
      process.chdir(previousDirectory);
      process.exitCode = previousExit ?? 0;
      if (previousState === undefined) delete process.env.EMET_STATE_DIR;
      else process.env.EMET_STATE_DIR = previousState;
    }
  });
});
