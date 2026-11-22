import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { didReserveTicket } from "./claims";
import {
  checkCodeReviewFanoutWithSiblingRun,
  recordCompletionEvent,
  run,
  type CompletionEventDependencies,
} from "./guard";
import { writeResult } from "./results";
import { readCompletionEvent } from "./runs";

let stdinSpy: { mockRestore: () => void } | null = null;

function stubStdinStream(factory: () => ReadableStream<Uint8Array<ArrayBuffer>>): void {
  stdinSpy?.mockRestore();
  stdinSpy = spyOn(Bun.stdin, "stream").mockImplementation(factory);
}

function stubStdin(chunks: string[]): void {
  const encoder = new TextEncoder();
  stubStdinStream(
    () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
  );
}

function stubFailingStdin(): void {
  stubStdinStream(() => {
    throw new Error("stdin is gone");
  });
}

let workingDirectory: string;
let previousDirectory: string;
let previousHost: string | undefined;
let previousStateDirectory: string | undefined;

beforeEach(() => {
  workingDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "guard-run-")));
  previousDirectory = process.cwd();
  previousHost = process.env.EMET_AGENT_HOST;
  previousStateDirectory = process.env.EMET_STATE_DIR;
  delete process.env.EMET_AGENT_HOST;
  process.env.EMET_STATE_DIR = path.join(workingDirectory, "state");
  process.chdir(workingDirectory);
});

afterEach(() => {
  process.chdir(previousDirectory);
  if (previousHost === undefined) delete process.env.EMET_AGENT_HOST;
  else process.env.EMET_AGENT_HOST = previousHost;
  if (previousStateDirectory === undefined) delete process.env.EMET_STATE_DIR;
  else process.env.EMET_STATE_DIR = previousStateDirectory;
  stdinSpy?.mockRestore();
  stdinSpy = null;
  rmSync(workingDirectory, { recursive: true, force: true });
});

async function runWithInput(
  raw: string[],
  argv: string[] = [],
): Promise<{ logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line: string) => void logs.push(line);
  console.error = (...parts: unknown[]) => void errors.push(parts.map(String).join(" "));
  stubStdin(raw);
  try {
    await run(argv);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { logs, errors };
}

describe("guard run() hook entry", () => {
  test("a destructive Bash call is denied with the hook output shape", async () => {
    const payload = JSON.stringify({
      tool_name: "Bash",
      cwd: workingDirectory,
      tool_input: { command: "git reset --hard HEAD~1" },
    });
    const { logs } = await runWithInput([payload]);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0] ?? "")).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
    expect(logs[0]).toContain("destructive");
  });

  test("a benign call prints nothing", async () => {
    const payload = JSON.stringify({
      tool_name: "Bash",
      cwd: workingDirectory,
      tool_input: { command: "ls" },
    });
    const { logs, errors } = await runWithInput([payload]);
    expect(logs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("empty stdin is treated as an empty payload and allowed", async () => {
    const { logs } = await runWithInput([""]);
    expect(logs).toEqual([]);
  });

  test("unparseable stdin is allowed and reported on stderr", async () => {
    const { logs, errors } = await runWithInput(["{not json"]);
    expect(logs).toEqual([]);
    expect(errors[0]).toContain("could not parse hook input, allowing the call");
  });

  test("stdin over 1 MiB is allowed and reported on stderr", async () => {
    const { logs, errors } = await runWithInput(["x".repeat(1024 * 1024 + 1)]);
    expect(logs).toEqual([]);
    expect(errors[0]).toContain("stdin exceeds 1 MiB");
  });

  test("a stdin read failure is allowed and reported on stderr", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...parts: unknown[]) => void errors.push(parts.map(String).join(" "));
    stubFailingStdin();
    try {
      await run([]);
    } finally {
      console.error = originalError;
    }
    expect(errors[0]).toContain("could not read stdin, allowing the call");
  });

  test("UserPromptSubmit does nothing on the claude host", async () => {
    const { logs, errors } = await runWithInput(
      [JSON.stringify({ prompt: "approve", cwd: workingDirectory })],
      ["--event", "UserPromptSubmit"],
    );
    expect(logs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("UserPromptSubmit on the codex host never throws or prints", async () => {
    process.env.EMET_AGENT_HOST = "codex";
    const { logs } = await runWithInput(
      [JSON.stringify({ prompt: "hello", cwd: workingDirectory })],
      ["--event", "UserPromptSubmit"],
    );
    expect(logs).toEqual([]);
  });

  test("a Stop event for a session with no run state is allowed silently", async () => {
    const { logs } = await runWithInput(
      [JSON.stringify({ hook_event_name: "Stop", session_id: "s1", cwd: workingDirectory })],
      ["--event", "Stop"],
    );
    expect(logs).toEqual([]);
  });

  test("a SubagentStop event outside any worker worktree is allowed silently", async () => {
    const { logs } = await runWithInput(
      [
        JSON.stringify({
          hook_event_name: "SubagentStop",
          session_id: "s2",
          cwd: workingDirectory,
          agent_transcript_path: "/tmp/transcript.jsonl",
          stop_hook_active: true,
        }),
      ],
      ["--event", "SubagentStop"],
    );
    expect(logs).toEqual([]);
  });

  test("a Stop payload that is not an object is tolerated", async () => {
    const { logs } = await runWithInput(["[1]"], ["--event", "Stop"]);
    expect(logs).toEqual([]);
  });

  test("on the codex host a destructive call is denied", async () => {
    process.env.EMET_AGENT_HOST = "codex";
    const payload = JSON.stringify({
      tool_name: "Bash",
      cwd: workingDirectory,
      tool_input: { command: "git reset --hard HEAD~1" },
    });
    const { logs } = await runWithInput([payload]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("deny");
  });
});

describe("checkCodeReviewFanoutWithSiblingRun", () => {
  test("a non-code-review call never lists slots", async () => {
    let listed = false;
    const verdict = await checkCodeReviewFanoutWithSiblingRun(
      { tool_name: "Bash", tool_input: { command: "ls" } },
      process.pid,
      () => {
        listed = true;
        return Promise.resolve([]);
      },
    );
    expect(verdict).toEqual({ decision: "allow" });
    expect(listed).toBe(false);
  });

  test("a code-review call with no occupied slots is allowed", async () => {
    const verdict = await checkCodeReviewFanoutWithSiblingRun(
      { tool_name: "Skill", tool_input: { skill: "plugin:code-review" } },
      process.pid,
      () => Promise.resolve([]),
    );
    expect(verdict).toEqual({ decision: "allow" });
  });
});

function dependencies(
  overrides: Partial<CompletionEventDependencies> = {},
): CompletionEventDependencies {
  return {
    resolveOwner: () => Promise.resolve({ runId: "r1", ticket: "CLA-1", branch: "cla-1" }),
    resolveCommonDirectory: () => Promise.resolve("/common"),
    countNewCommits: () => Promise.resolve(3),
    writeEvent: () => undefined,
    now: () => new Date(0),
    ...overrides,
  };
}

describe("recordCompletionEvent", () => {
  const verdictAllow = { decision: "allow" } as const;

  test("writes an allowed event with the owner, commit count and transcript path", async () => {
    const written: unknown[] = [];
    await recordCompletionEvent(
      "SubagentStop",
      { cwd: "/wt", session_id: "sess-1", agent_transcript_path: "/t.jsonl" },
      verdictAllow,
      dependencies({ writeEvent: (_directory, event) => void written.push(event) }),
    );
    expect(written).toEqual([
      {
        runId: "r1",
        ticket: "CLA-1",
        event: "SubagentStop",
        outcome: "allowed",
        at: "1970-01-01T00:00:00.000Z",
        sessionId: "sess-1",
        branch: "cla-1",
        commits: 3,
        agentTranscriptPath: "/t.jsonl",
      },
    ]);
  });

  test("a blocked verdict is recorded as blocked without a transcript path", async () => {
    const written: Record<string, unknown>[] = [];
    await recordCompletionEvent(
      "Stop",
      { cwd: "/wt" },
      { decision: "block", reason: "no report" },
      dependencies({ writeEvent: (_directory, event) => void written.push({ ...event }) }),
    );
    expect(written[0]).toMatchObject({ outcome: "blocked", sessionId: null });
    expect(written[0]).not.toHaveProperty("agentTranscriptPath");
  });

  test("nothing is written without a cwd, an owner or a common directory", async () => {
    const written: unknown[] = [];
    const writeEvent: CompletionEventDependencies["writeEvent"] = (_directory, event) =>
      void written.push(event);
    await recordCompletionEvent("Stop", {}, verdictAllow, dependencies({ writeEvent }));
    await recordCompletionEvent(
      "Stop",
      { cwd: "/wt" },
      verdictAllow,
      dependencies({ writeEvent, resolveOwner: () => Promise.resolve(null) }),
    );
    await recordCompletionEvent(
      "Stop",
      { cwd: "/wt" },
      verdictAllow,
      dependencies({ writeEvent, resolveCommonDirectory: () => Promise.resolve(null) }),
    );
    expect(written).toEqual([]);
  });

  test("a failing dependency is logged and swallowed", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...parts: unknown[]) => void errors.push(parts.map(String).join(" "));
    try {
      await recordCompletionEvent(
        "Stop",
        { cwd: "/wt" },
        verdictAllow,
        dependencies({
          writeEvent: () => {
            throw new Error("disk full");
          },
        }),
      );
    } finally {
      console.error = originalError;
    }
    expect(errors[0]).toContain("could not record the completion event");
  });
});

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(
    ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-C", cwd, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function makeRepoWithCommit(): string {
  const repo = path.join(workingDirectory, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  return repo;
}

describe("recordCompletionEvent with real git state", () => {
  test("records the owner, branch and new commit count of a locked worker worktree", async () => {
    const repo = makeRepoWithCommit();
    const worktree = path.join(workingDirectory, "wt");
    git(repo, "worktree", "add", "-q", "-b", "cla-1-x", worktree);
    git(worktree, "commit", "-q", "--allow-empty", "-m", "work");
    git(
      repo,
      "worktree",
      "lock",
      worktree,
      "--reason",
      "emet run=r1 ticket=CLA-1 anchor=1 at=2026",
    );
    await recordCompletionEvent("Stop", { cwd: worktree }, { decision: "allow" });
    const event = readCompletionEvent(path.join(repo, ".git"), "r1", "CLA-1");
    expect(event).toMatchObject({
      runId: "r1",
      ticket: "CLA-1",
      event: "Stop",
      outcome: "allowed",
      branch: "cla-1-x",
      commits: 1,
    });
  });

  test("writes nothing for a worktree that no run owns", async () => {
    const repo = makeRepoWithCommit();
    await recordCompletionEvent("Stop", { cwd: repo }, { decision: "allow" });
    expect(existsSync(path.join(repo, ".git", ".emet"))).toBe(false);
  });
});

function seedSpecRun(runDirectory: string): void {
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(path.join(runDirectory, "spec.md"), "# spec\n");
  writeFileSync(path.join(runDirectory, "tickets.json"), "[]\n");
}

describe("guard run() argument handling", () => {
  test("--mark-final-report with an invalid session id fails with exit code 1", async () => {
    const { errors } = await runWithInput([], ["--mark-final-report", "../bad id"]);
    expect(errors[0]).toContain("invalid session id");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  test("codex UserPromptSubmit approves a spec run found at the repository root", async () => {
    process.env.EMET_AGENT_HOST = "codex";
    const repo = makeRepoWithCommit();
    const runDirectory = path.join(repo, ".emet", "runs", "spec12");
    seedSpecRun(runDirectory);
    await runWithInput(
      [JSON.stringify({ prompt: "approve 12", cwd: repo })],
      ["--event", "UserPromptSubmit"],
    );
    expect(existsSync(path.join(runDirectory, "approval.json"))).toBe(true);
  });

  test("codex UserPromptSubmit keeps approval recording and records working", async () => {
    process.env.EMET_AGENT_HOST = "codex";
    const repo = makeOwnedRepo();
    const runDirectory = path.join(repo, ".emet", "runs", "spec12");
    seedSpecRun(runDirectory);
    const { logs } = await runWithInput(
      [JSON.stringify({ session_id: "sess-9", prompt: "approve 12", cwd: repo })],
      ["--event", "UserPromptSubmit"],
    );
    expect(logs).toEqual([]);
    expect(existsSync(path.join(runDirectory, "approval.json"))).toBe(true);
    expect(recordedStates()).toEqual([
      { sessionId: "sess-9", state: "working", from: null, trigger: "UserPromptSubmit" },
    ]);
  });

  test("codex UserPromptSubmit prefers runs shared under the git common directory", async () => {
    process.env.EMET_AGENT_HOST = "codex";
    const repo = makeRepoWithCommit();
    const runDirectory = path.join(repo, ".git", ".emet", "runs", "spec7");
    seedSpecRun(runDirectory);
    await runWithInput(
      [JSON.stringify({ prompt: "approve 7", cwd: repo })],
      ["--event", "UserPromptSubmit"],
    );
    expect(existsSync(path.join(runDirectory, "approval.json"))).toBe(true);
  });
});

function makeOwnedRepo(): string {
  const repo = makeRepoWithCommit();
  writeFileSync(path.join(repo, "emet.config.json"), "{}\n");
  mkdirSync(path.join(repo, ".emet"));
  writeFileSync(
    path.join(repo, ".emet", "phase.json"),
    JSON.stringify({ phase: "working", wave: 1, spec: "866", runId: "run9", updatedAt: "2026" }),
  );
  return repo;
}

function journalLines(): string[] {
  const file = path.join(workingDirectory, "state", "journal", "events.jsonl");
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];
}

function recordedStates(): unknown[] {
  return journalLines().map((line) => {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && "data" in parsed ? parsed.data : null;
  });
}

const DESTRUCTIVE_COMMAND = ["git", "reset", `--hard`, "HEAD~1"].join(" ");

describe("guard run() attention recording", () => {
  test("PermissionRequest prints nothing and records a small needs-decision line", async () => {
    const repo = makeOwnedRepo();
    const payload = JSON.stringify({
      session_id: "sess-1",
      cwd: repo,
      tool_name: "Bash",
      tool_input: { command: "x".repeat(1024 * 1024 - 200) },
    });
    const { logs, errors } = await runWithInput([payload], ["--event", "PermissionRequest"]);
    expect(logs).toEqual([]);
    expect(errors).toEqual([]);
    expect(process.exitCode ?? 0).toBe(0);
    const lines = journalLines();
    expect(lines).toHaveLength(1);
    expect(Buffer.byteLength(lines[0] ?? "")).toBeLessThan(2048);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      kind: "session.attention",
      runId: "run9",
      repo,
      data: {
        sessionId: "sess-1",
        state: "needs-decision",
        from: null,
        trigger: "PermissionRequest",
      },
    });
  });

  test("PermissionRequest in a repo without an emet config records nothing", async () => {
    const repo = makeRepoWithCommit();
    const { logs } = await runWithInput(
      [JSON.stringify({ session_id: "sess-1", cwd: repo })],
      ["--event", "PermissionRequest"],
    );
    expect(logs).toEqual([]);
    expect(journalLines()).toEqual([]);
  });

  test("Notification, UserPromptSubmit and SessionEnd print nothing and record each change", async () => {
    const repo = makeOwnedRepo();
    const base = { session_id: "sess-2", cwd: repo };
    const notification = JSON.stringify({
      ...base,
      notification_type: "idle_prompt",
      message: "secret",
    });
    const outputs = [
      await runWithInput([notification], ["--event", "Notification"]),
      await runWithInput(
        [JSON.stringify({ ...base, prompt: "hush" })],
        ["--event", "UserPromptSubmit"],
      ),
      await runWithInput([JSON.stringify(base)], ["--event", "SessionEnd"]),
    ];
    expect(outputs.flatMap((output) => output.logs.concat(output.errors))).toEqual([]);
    expect(recordedStates()).toEqual([
      { sessionId: "sess-2", state: "idle", from: null, trigger: "Notification" },
      { sessionId: "sess-2", state: "working", from: "idle", trigger: "UserPromptSubmit" },
      { sessionId: "sess-2", state: "ended", from: "working", trigger: "SessionEnd" },
    ]);
    expect(journalLines().join("\n")).not.toContain("secret");
    expect(journalLines().join("\n")).not.toContain("hush");
  });

  test("a denied PreToolUse keeps its output and records working once", async () => {
    const repo = makeOwnedRepo();
    const payload = JSON.stringify({
      session_id: "sess-3",
      cwd: repo,
      tool_name: "Bash",
      tool_input: { command: DESTRUCTIVE_COMMAND },
    });
    const first = await runWithInput([payload]);
    const second = await runWithInput([payload]);
    expect(first.logs).toEqual(second.logs);
    expect(JSON.parse(first.logs[0] ?? "")).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    expect(recordedStates()).toEqual([
      { sessionId: "sess-3", state: "working", from: null, trigger: "PreToolUse" },
    ]);
  });

  test("an allowed Stop records idle and a blocked codex run records needs-decision", async () => {
    const repo = makeOwnedRepo();
    await runWithInput([JSON.stringify({ session_id: "sess-4", cwd: repo })], ["--event", "Stop"]);
    process.env.EMET_AGENT_HOST = "codex";
    writeResult(path.join(repo, ".git", ".emet", "runs", "run9", "results"), "CLA-1", {
      status: "BLOCKED",
      reportPath: "r.md",
      risk: "Risk: none",
    });
    const { logs } = await runWithInput(
      [JSON.stringify({ session_id: "sess-5", cwd: repo })],
      ["--event", "Stop"],
    );
    expect(logs).toEqual([]);
    expect(recordedStates()).toEqual([
      { sessionId: "sess-4", state: "idle", from: null, trigger: "Stop" },
      { sessionId: "sess-5", state: "needs-decision", from: null, trigger: "Stop" },
    ]);
  });

  test("a Stop the guard blocks records no attention", async () => {
    const repo = makeOwnedRepo();
    process.chdir(repo);
    expect(await didReserveTicket("run9", process.pid, "CLA-1")).toBe(true);
    const { logs } = await runWithInput(
      [JSON.stringify({ session_id: "sess-6", cwd: repo })],
      ["--event", "Stop"],
    );
    expect(JSON.parse(logs[0] ?? "")).toMatchObject({ decision: "block" });
    expect(recordedStates()).toEqual([]);
  });
});
