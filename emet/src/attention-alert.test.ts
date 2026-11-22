import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CommandResult } from "./agenthost";
import { recordAttention, type AttentionTransition } from "./attention";
import { alertNeedsDecision, timedRunner } from "./attention-alert";

const transition: AttentionTransition = {
  sessionId: "s1",
  repo: "/work/my-repo",
  runId: null,
  from: "working",
  to: "needs-decision",
  trigger: "PermissionRequest",
};

const reachable = JSON.stringify({ result: { runtime: { reachable: true } } });

function fakeRunner(orca: CommandResult) {
  const calls: string[][] = [];
  const runner = (command: readonly string[]): Promise<CommandResult> => {
    calls.push([...command]);
    if (command[0] === "orca" && command[1] === "status") return Promise.resolve(orca);
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  };
  return { calls, runner };
}

function failingSet(command: readonly string[]): Promise<CommandResult> {
  const isStatus = command[1] === "status";
  return Promise.resolve({
    exitCode: isStatus ? 0 : 1,
    stdout: isStatus ? reachable : "",
    stderr: "",
  });
}

function failingAll(): Promise<CommandResult> {
  return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
}

function withRepo(config: string | null, run: (repo: string) => Promise<void>): Promise<void> {
  const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-alert-repo-")));
  if (config !== null) writeFileSync(path.join(repo, "emet.config.json"), config);
  return run(repo).finally(() => {
    rmSync(repo, { recursive: true, force: true });
  });
}

function throwingRunner(): Promise<CommandResult> {
  return Promise.reject(new Error("boom"));
}

const base = { alertEnabled: () => Promise.resolve(true), hasNotifySend: () => true };

describe("alertNeedsDecision", () => {
  test("marks the worktree unread when Orca is reachable", async () => {
    const { calls, runner } = fakeRunner({ exitCode: 0, stdout: reachable, stderr: "" });
    expect(await alertNeedsDecision(transition, { ...base, runner })).toBe("orca");
    expect(calls[1]).toEqual([
      "orca",
      "worktree",
      "set",
      "--worktree",
      "path:/work/my-repo",
      "--comment",
      "emet: a session needs a decision",
      "--unread",
    ]);
    expect(calls).toHaveLength(2);
  });

  test("falls back to notify-send when Orca is not reachable", async () => {
    const { calls, runner } = fakeRunner({ exitCode: 1, stdout: "", stderr: "" });
    expect(await alertNeedsDecision(transition, { ...base, runner })).toBe("notify-send");
    expect(calls[1]).toEqual(["notify-send", "emet", "my-repo: a session needs a decision"]);
  });

  test("does nothing without Orca or notify-send", async () => {
    const { calls, runner } = fakeRunner({ exitCode: 1, stdout: "not json", stderr: "" });
    const outcome = await alertNeedsDecision(transition, {
      ...base,
      runner,
      hasNotifySend: () => false,
    });
    expect(outcome).toBe("none");
    expect(calls).toHaveLength(1);
  });

  test("runs nothing when attention.alert is false", async () => {
    const { calls, runner } = fakeRunner({ exitCode: 0, stdout: reachable, stderr: "" });
    const outcome = await alertNeedsDecision(transition, {
      runner,
      alertEnabled: () => Promise.resolve(false),
    });
    expect(outcome).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  test("a throwing runner resolves to none", async () => {
    expect(await alertNeedsDecision(transition, { ...base, runner: throwingRunner })).toBe("none");
  });
});

describe("alert defaults", () => {
  const unreachable = { exitCode: 1, stdout: "", stderr: "" };

  test("reads attention.alert from the repo config", () =>
    withRepo(JSON.stringify({ version: 1, attention: { alert: false } }), async (repo) => {
      const { calls, runner } = fakeRunner(unreachable);
      const outcome = await alertNeedsDecision({ ...transition, repo }, { runner });
      expect(outcome).toBe("disabled");
      expect(calls).toHaveLength(0);
    }));

  test("a missing or malformed config keeps the alert on", async () => {
    await withRepo(null, async (repo) => {
      const { runner } = fakeRunner(unreachable);
      const outcome = await alertNeedsDecision(
        { ...transition, repo },
        { runner, hasNotifySend: () => false },
      );
      expect(outcome).toBe("none");
    });
    await withRepo("{not json", async (repo) => {
      const { calls, runner } = fakeRunner(unreachable);
      await alertNeedsDecision({ ...transition, repo }, { runner, hasNotifySend: () => true });
      expect(calls[1]?.[0]).toBe("notify-send");
    });
  });

  test("failed alert commands resolve to none", async () => {
    expect(await alertNeedsDecision(transition, { ...base, runner: failingSet })).toBe("none");
    expect(await alertNeedsDecision(transition, { ...base, runner: failingAll })).toBe("none");
  });

  test("an Orca status that is not JSON falls through", async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: "not json", stderr: "" });
    const outcome = await alertNeedsDecision(transition, {
      ...base,
      runner,
      hasNotifySend: () => false,
    });
    expect(outcome).toBe("none");
  });

  test("the default runner reports exit codes and missing binaries", async () => {
    expect((await timedRunner(["true"])).exitCode).toBe(0);
    expect((await timedRunner(["emet-no-such-binary-xyz"])).exitCode).toBe(127);
  });

  test("an Orca status that is not reachable JSON falls through", async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: '{"result":{}}', stderr: "" });
    expect(
      await alertNeedsDecision(transition, { ...base, runner, hasNotifySend: () => false }),
    ).toBe("none");
  });

  test("the default notify-send probe does not throw", async () => {
    const { runner } = fakeRunner(unreachable);
    const outcome = await alertNeedsDecision(transition, {
      runner,
      alertEnabled: () => Promise.resolve(true),
    });
    expect(["notify-send", "none"]).toContain(outcome);
  });
});

describe("recordAttention alert", () => {
  test("alerts once on entering needs-decision and not on a repeat", async () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-alert-")));
    try {
      const alerts: AttentionTransition[] = [];
      const deps = {
        journal: { directory: path.join(root, "journal") },
        host: "claude" as const,
        resolveOwner: () => Promise.resolve({ repo: "/repo", runId: "run1" }),
        alert: (entered: AttentionTransition) => {
          alerts.push(entered);
          return Promise.resolve();
        },
      };
      const hook = { session_id: "sess-1", cwd: "/repo" };
      await recordAttention("PreToolUse", hook, deps);
      await recordAttention("PermissionRequest", hook, deps);
      await recordAttention("PermissionRequest", hook, deps);
      await recordAttention("PreToolUse", hook, deps);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ from: "working", to: "needs-decision" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
