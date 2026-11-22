import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attentionStateFor,
  lastAttentionState,
  readSessionAttention,
  recordAttention,
  resolveAttentionOwner,
  type AttentionDeps,
  type AttentionOwner,
} from "./attention";
import { appendEvent, type JournalDeps } from "./journal";

let root: string;
let journal: JournalDeps;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-attention-")));
  journal = { directory: path.join(root, "journal") };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function journalLines(): string[] {
  try {
    return readFileSync(path.join(root, "journal", "events.jsonl"), "utf8")
      .trim()
      .split("\n");
  } catch {
    return [];
  }
}

const owned: AttentionOwner = { repo: "/repo", runId: "run1" };

function deps(overrides: Partial<AttentionDeps> = {}): AttentionDeps {
  return {
    journal,
    host: "claude",
    resolveOwner: () => Promise.resolve(owned),
    runBlocked: () => Promise.resolve(false),
    ...overrides,
  };
}

function hook(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { session_id: "sess-1", cwd: "/repo", ...fields };
}

function seedAttention(sessionId: string, state: string, extra: Partial<JournalDeps> = {}): void {
  appendEvent(
    {
      kind: "session.attention",
      runId: "run1",
      repo: "/repo",
      origin: "auto",
      data: { sessionId, state, from: null, trigger: "PreToolUse" },
    },
    { ...journal, ...extra },
  );
}

describe("attentionStateFor", () => {
  const claude = { host: "claude", runBlocked: false } as const;

  test("maps each trigger to its state", () => {
    expect(attentionStateFor("PermissionRequest", claude)).toBe("needs-decision");
    expect(attentionStateFor("UserPromptSubmit", claude)).toBe("working");
    expect(attentionStateFor("PreToolUse", claude)).toBe("working");
    expect(attentionStateFor("Stop", claude)).toBe("idle");
    expect(attentionStateFor("SessionEnd", claude)).toBe("ended");
  });

  test("maps the decision notification types to needs-decision", () => {
    for (const notificationType of [
      "permission_prompt",
      "elicitation_dialog",
      "elicitation_url_dialog",
      "agent_needs_input",
    ]) {
      expect(attentionStateFor("Notification", { ...claude, notificationType })).toBe(
        "needs-decision",
      );
    }
  });

  test("maps idle_prompt to idle and any other or missing type to no change", () => {
    expect(attentionStateFor("Notification", { ...claude, notificationType: "idle_prompt" })).toBe(
      "idle",
    );
    expect(attentionStateFor("Notification", { ...claude, notificationType: "auth_success" })).toBe(
      null,
    );
    expect(attentionStateFor("Notification", claude)).toBe(null);
  });

  test("a codex Stop with a blocked run needs a decision, a claude one is idle", () => {
    expect(attentionStateFor("Stop", { host: "codex", runBlocked: true })).toBe("needs-decision");
    expect(attentionStateFor("Stop", { host: "codex", runBlocked: false })).toBe("idle");
    expect(attentionStateFor("Stop", { host: "claude", runBlocked: true })).toBe("idle");
  });
});

describe("lastAttentionState", () => {
  test("is null for an empty journal", () => {
    expect(lastAttentionState("sess-1", journal)).toBe(null);
  });

  test("matches the session id exactly when sessions interleave", () => {
    seedAttention("sess-1", "working");
    seedAttention("sess-10", "idle");
    seedAttention("sess-2", "needs-decision");
    seedAttention("sess-1", "needs-decision");
    seedAttention("sess-2", "idle");
    expect(lastAttentionState("sess-1", journal)).toBe("needs-decision");
    expect(lastAttentionState("sess-10", journal)).toBe("idle");
    expect(lastAttentionState("sess-3", journal)).toBe(null);
  });

  test("ignores other kinds and malformed attention data", () => {
    seedAttention("sess-1", "working");
    appendEvent(
      { kind: "cleanup", repo: "/repo", origin: "auto", data: { sessionId: "sess-1" } },
      journal,
    );
    appendEvent(
      {
        kind: "session.attention",
        repo: "/repo",
        origin: "auto",
        data: { sessionId: "sess-1", state: "asleep" },
      },
      journal,
    );
    expect(lastAttentionState("sess-1", journal)).toBe("working");
  });

  test("a journal rotated right before the lookup has no previous state", () => {
    seedAttention("sess-1", "working", { rotateAtBytes: 10 });
    seedAttention("sess-2", "working", { rotateAtBytes: 10 });
    expect(lastAttentionState("sess-1", journal)).toBe(null);
  });
});

describe("recordAttention", () => {
  test("a Notification never records its message or title", async () => {
    const transition = await recordAttention(
      "Notification",
      hook({ notification_type: "permission_prompt", message: "secret", title: "hidden" }),
      deps(),
    );
    expect(transition).toEqual({
      sessionId: "sess-1",
      repo: "/repo",
      runId: "run1",
      from: null,
      to: "needs-decision",
      trigger: "Notification",
    });
    const lines = journalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("hidden");
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      kind: "session.attention",
      runId: "run1",
      repo: "/repo",
      data: { sessionId: "sess-1", state: "needs-decision", from: null, trigger: "Notification" },
    });
  });

  test("idle_prompt after working records the previous state", async () => {
    await recordAttention("PreToolUse", hook(), deps());
    const transition = await recordAttention(
      "Notification",
      hook({ notification_type: "idle_prompt" }),
      deps(),
    );
    expect(transition).toMatchObject({ from: "working", to: "idle" });
    expect(journalLines()).toHaveLength(2);
  });

  test("a repeated state appends nothing and skips the owner lookup", async () => {
    let lookups = 0;
    const counting = deps({
      resolveOwner: () => {
        lookups += 1;
        return Promise.resolve(owned);
      },
    });
    await recordAttention("PreToolUse", hook(), counting);
    expect(await recordAttention("PreToolUse", hook(), counting)).toBe(null);
    expect(await recordAttention("UserPromptSubmit", hook(), counting)).toBe(null);
    expect(journalLines()).toHaveLength(1);
    expect(lookups).toBe(1);
  });

  test("an unknown notification type changes nothing", async () => {
    let lookups = 0;
    const transition = await recordAttention(
      "Notification",
      hook({ notification_type: "something_new" }),
      deps({
        resolveOwner: () => {
          lookups += 1;
          return Promise.resolve(owned);
        },
      }),
    );
    expect(transition).toBe(null);
    expect(await recordAttention("Notification", hook({ notification_type: 7 }), deps())).toBe(
      null,
    );
    expect(lookups).toBe(0);
    expect(journalLines()).toEqual([]);
  });

  test("records nothing for an invalid session, a missing cwd or a non-object input", async () => {
    expect(await recordAttention("PreToolUse", hook({ session_id: "../x" }), deps())).toBe(null);
    expect(await recordAttention("PreToolUse", hook({ cwd: 3 }), deps())).toBe(null);
    expect(await recordAttention("PreToolUse", hook({ cwd: "" }), deps())).toBe(null);
    expect(await recordAttention("PreToolUse", [1], deps())).toBe(null);
    expect(journalLines()).toEqual([]);
  });

  test("records nothing for a session emet does not own", async () => {
    const transition = await recordAttention(
      "PermissionRequest",
      hook(),
      deps({ resolveOwner: () => Promise.resolve(null) }),
    );
    expect(transition).toBe(null);
    expect(journalLines()).toEqual([]);
  });

  test("omits the run id when the owner has none", async () => {
    await recordAttention(
      "PreToolUse",
      hook(),
      deps({ resolveOwner: () => Promise.resolve({ repo: "/repo", runId: null }) }),
    );
    expect(JSON.parse(journalLines()[0] ?? "")).not.toHaveProperty("runId");
  });

  test("a codex Stop with a blocked run needs a decision", async () => {
    await recordAttention("PreToolUse", hook(), deps({ host: "codex" }));
    const transition = await recordAttention(
      "Stop",
      hook(),
      deps({ host: "codex", runBlocked: () => Promise.resolve(true) }),
    );
    expect(transition).toMatchObject({ from: "working", to: "needs-decision" });
    expect(
      await recordAttention(
        "Stop",
        hook(),
        deps({ host: "codex", runBlocked: () => Promise.resolve(true) }),
      ),
    ).toBe(null);
  });

  test("a huge tool_input still yields a small line", async () => {
    await recordAttention(
      "PermissionRequest",
      hook({ tool_name: "Bash", tool_input: { command: "x".repeat(1_000_000) } }),
      deps(),
    );
    const [line] = journalLines();
    expect(Buffer.byteLength(line ?? "")).toBeLessThan(2048);
    expect(line).not.toContain("Bash");
  });

  test("a failure is swallowed after one stderr line", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...parts: unknown[]) => void errors.push(parts.map(String).join(" "));
    try {
      const transition = await recordAttention(
        "PreToolUse",
        hook(),
        deps({ resolveOwner: () => Promise.reject(new Error("git vanished")) }),
      );
      expect(transition).toBe(null);
    } finally {
      console.error = originalError;
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("could not record the attention state: git vanished");
    expect(errors[0]?.split("\n")).toHaveLength(1);
    expect(journalLines()).toEqual([]);
  });
});

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(
    ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-C", cwd, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function makeRepo(): string {
  const repo = path.join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  return repo;
}

function writeConfigAndPhase(repo: string, phase: string | null): void {
  writeFileSync(path.join(repo, "emet.config.json"), "{}\n");
  if (phase === null) return;
  mkdirSync(path.join(repo, ".emet"), { recursive: true });
  writeFileSync(
    path.join(repo, ".emet", "phase.json"),
    JSON.stringify({ phase, wave: 1, spec: "866", runId: "run9", updatedAt: "2026" }),
  );
}

describe("resolveAttentionOwner", () => {
  test("a worker worktree maps to the main worktree root and its run", async () => {
    const repo = makeRepo();
    const worktree = path.join(root, "wt");
    git(repo, "worktree", "add", "-q", "-b", "cla-1-x", worktree);
    git(
      repo,
      "worktree",
      "lock",
      worktree,
      "--reason",
      "emet run=r1 ticket=CLA-1 anchor=1 at=2026",
    );
    expect(await resolveAttentionOwner(worktree)).toEqual({ repo, runId: "r1" });
  });

  test("a repo with a config and an unfinished phase is owned", async () => {
    const repo = makeRepo();
    writeConfigAndPhase(repo, "working");
    mkdirSync(path.join(repo, "sub"));
    expect(await resolveAttentionOwner(path.join(repo, "sub"))).toEqual({ repo, runId: "run9" });
  });

  test("a finished run, a missing phase or a missing config is not owned", async () => {
    const repo = makeRepo();
    expect(await resolveAttentionOwner(repo)).toBe(null);
    writeConfigAndPhase(repo, null);
    expect(await resolveAttentionOwner(repo)).toBe(null);
    writeConfigAndPhase(repo, "done");
    expect(await resolveAttentionOwner(repo)).toBe(null);
    writeConfigAndPhase(repo, "failed");
    expect(await resolveAttentionOwner(repo)).toBe(null);
  });

  test("a directory outside git is not owned", async () => {
    expect(await resolveAttentionOwner(root)).toBe(null);
    expect(await resolveAttentionOwner(path.join(root, "missing"))).toBe(null);
  });
});

function seedAt(
  iso: string,
  sessionId: string,
  state: string,
  repo = "/repo",
  runId?: string,
): void {
  appendEvent(
    {
      kind: "session.attention",
      ...(runId === undefined ? {} : { runId }),
      repo,
      origin: "auto",
      data: { sessionId, state, from: null, trigger: "Stop" },
    },
    { ...journal, now: () => new Date(iso) },
  );
}

describe("readSessionAttention", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");

  test("returns the latest state per session and excludes ended sessions", () => {
    seedAt("2026-11-22T11:00:00.000Z", "a", "working", "/repo", "run1");
    seedAt("2026-11-22T11:30:00.000Z", "a", "needs-decision", "/repo", "run1");
    seedAt("2026-11-22T11:10:00.000Z", "b", "idle");
    seedAt("2026-11-22T11:20:00.000Z", "c", "working");
    seedAt("2026-11-22T11:40:00.000Z", "c", "ended");
    expect(readSessionAttention({ now }, journal)).toEqual([
      {
        sessionId: "a",
        repo: "/repo",
        runId: "run1",
        state: "needs-decision",
        blocked: true,
        since: "2026-11-22T11:30:00.000Z",
      },
      {
        sessionId: "b",
        repo: "/repo",
        runId: null,
        state: "idle",
        blocked: false,
        since: "2026-11-22T11:10:00.000Z",
      },
    ]);
  });

  test("filters by repo and by the window", () => {
    seedAt("2026-11-21T11:59:59.000Z", "old", "working");
    seedAt("2026-11-21T12:00:00.000Z", "edge", "working");
    seedAt("2026-11-22T11:00:00.000Z", "other", "working", "/elsewhere");
    expect(
      readSessionAttention({ now, repo: "/repo" }, journal).map((each) => each.sessionId),
    ).toEqual(["edge"]);
    expect(
      readSessionAttention({ now, windowMs: 3_600_000 }, journal).map((each) => each.sessionId),
    ).toEqual(["other"]);
  });

  test("skips events with malformed data and reads the real clock by default", () => {
    appendEvent(
      { kind: "session.attention", repo: "/repo", origin: "auto", data: { sessionId: 1 } },
      journal,
    );
    appendEvent(
      {
        kind: "session.attention",
        repo: "/repo",
        origin: "auto",
        data: { sessionId: "z", state: "working" },
      },
      journal,
    );
    appendEvent({ kind: "cleanup", repo: "/repo", origin: "auto", data: {} }, journal);
    expect(readSessionAttention({}, journal).map((each) => each.sessionId)).toEqual(["z"]);
  });
});
