import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { claudeHost } from "./agenthost-claude";
import { writeCompletionEvent } from "./runs";
import { readLastStepFor, run, transcriptParsers } from "./usage";

const originalCwd = process.cwd();
const originalHome = process.env.HOME;
let sandbox = "";
let logs: string[] = [];
let errors: string[] = [];

const jsonl = (...events: unknown[]): string =>
  `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;

const assistantTurn = (
  inputTokens: number,
  cacheRead: number,
  content: unknown[] = [],
  usageExtras: Record<string, unknown> = { cache_read_input_tokens: cacheRead },
) => ({
  type: "assistant",
  message: { usage: { input_tokens: inputTokens, ...usageExtras }, content },
});

const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) => ({
  type: "tool_use",
  id,
  name,
  input,
});

const toolResult = (id: string, content: unknown) => ({
  type: "tool_result",
  tool_use_id: id,
  content,
});

const setAge = (file: string, minutesAgo: number): void => {
  const when = new Date(Date.now() - minutesAgo * 60_000);
  utimesSync(file, when, when);
};

const git = (cwd: string, ...args: string[]): string => {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
    },
  });
  return result.stdout.toString();
};

const makeRepo = (): string => {
  const repo = path.join(sandbox, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "a.txt"), "a");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  return repo;
};

const projectDirectory = (): string => claudeHost.workerTranscriptRoot(sandbox);

const output = (): string => logs.join("\n");

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "emet-usage-")));
  process.env.HOME = path.join(sandbox, "home");
  mkdirSync(process.env.HOME, { recursive: true });
  process.chdir(sandbox);
  logs = [];
  errors = [];
  spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  process.exitCode = 0;
});

afterEach(() => {
  process.exitCode = 0;
  process.chdir(originalCwd);
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  rmSync(claudeHost.workerTranscriptRoot(sandbox), { recursive: true, force: true });
  rmSync(sandbox, { recursive: true, force: true });
  spyOn(console, "log").mockRestore();
  spyOn(console, "error").mockRestore();
});

describe("run --file", () => {
  test("reports turns, cache reads, contexts, boundaries, top tool results and oversized reads", async () => {
    const bigFile = path.join(sandbox, "big.txt");
    writeFileSync(bigFile, "line\n".repeat(500));
    const smallFile = path.join(sandbox, "small.txt");
    writeFileSync(smallFile, "a\nb\n");
    const transcript = path.join(sandbox, "t.jsonl");
    writeFileSync(
      transcript,
      `${jsonl(
        assistantTurn(10, 1_000_000, [
          toolUse("a", "Read", { file_path: bigFile }),
          toolUse("b", "Read", { file_path: smallFile }),
          toolUse("c", "Read", { file_path: path.join(sandbox, "missing.txt"), limit: 5 }),
          toolUse("d", "Read", { file_path: path.join(sandbox, "gone.txt") }),
          toolUse("e", "Bash"),
          { type: "tool_use", id: "f" },
          "not-an-object",
          { type: "text", text: "hi" },
        ]),
        {
          type: "user",
          message: {
            content: [
              toolResult("a", "x".repeat(4096)),
              toolResult("b", [{ type: "text", text: "yy" }, { type: "image" }, "stray"]),
              toolResult("e", { weird: true }),
              toolResult("zzz", "orphan"),
            ],
          },
        },
        { type: "system", subtype: "compact_boundary" },
        { type: "noMessage" },
        { message: { content: "plain string" } },
        assistantTurn(20, 0, [], {
          cache_read_input_tokens: 500_000,
          cache_creation_input_tokens: 7,
        }),
        assistantTurn(30, 0, [], {}),
      )}not json at all\n[1,2]\n`,
    );

    await run(["--file", transcript]);

    expect(process.exitCode).toBe(0);
    const text = output();
    expect(text).toContain(`=== ${transcript} ===`);
    expect(text).toContain("turns:               3");
    expect(text).toContain("cache_read (M tok):  1.50");
    expect(text).toContain("floor context:       1,000,010");
    expect(text).toContain("peak context:        1,000,010");
    expect(text).toContain("final context:       30");
    expect(text).toContain("compact boundaries:  1");
    expect(text).toContain("oversized Read (>400 lines, unbounded): 1");
    expect(text).toContain("4.0 KB  Read");
    expect(text).toContain("0.0 KB  Read");
    expect(text).toContain("0.0 KB  Bash");
    expect(text).toContain("0.0 KB  unknown");
  });

  test("a transcript with no usage data fails with a message", async () => {
    const transcript = path.join(sandbox, "empty.jsonl");
    writeFileSync(transcript, jsonl({ type: "user", message: { content: [] } }));
    await run(["--file", transcript]);
    expect(process.exitCode).toBe(1);
    expect(errors.some((line) => line.includes(`no usage data found in ${transcript}`))).toBe(true);
  });

  test("a missing transcript fails with a message", async () => {
    const transcript = path.join(sandbox, "nope.jsonl");
    await run(["--file", transcript]);
    expect(process.exitCode).toBe(1);
    expect(errors.some((line) => line.includes("no usage data found"))).toBe(true);
  });

  test("--file without a path fails", async () => {
    await run(["--file"]);
    expect(process.exitCode).toBe(1);
    expect(errors).toContain("--file requires a path");
  });

  test("a missing emet.config.json inside a git repo prints the defaults note", async () => {
    Bun.spawnSync(["git", "init", "-q", sandbox]);
    const transcript = path.join(sandbox, "t.jsonl");
    writeFileSync(transcript, jsonl(assistantTurn(1, 0)));
    await run(["--file", transcript]);
    expect(errors.some((line) => line.includes("using defaults"))).toBe(true);
    expect(output()).toContain("turns:               1");
  });

  test("a malformed emet.config.json is reported as an error with exit code 1", async () => {
    Bun.spawnSync(["git", "init", "-q", sandbox]);
    writeFileSync(path.join(sandbox, "emet.config.json"), "{ not json");
    await run(["--file", path.join(sandbox, "t.jsonl")]);
    expect(process.exitCode).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("a configured oversizedReadLines threshold changes what counts", async () => {
    Bun.spawnSync(["git", "init", "-q", sandbox]);
    writeFileSync(
      path.join(sandbox, "emet.config.json"),
      JSON.stringify({
        version: 1,
        repo: { trunk: "main", remote: "origin" },
        ticket: { idPattern: "^[A-Z]+-\\d+$", branchPrefix: "t" },
        usage: { oversizedReadLines: 3 },
      }),
    );
    const target = path.join(sandbox, "five.txt");
    writeFileSync(target, "1\n2\n3\n4\n5\n");
    const transcript = path.join(sandbox, "t.jsonl");
    writeFileSync(
      transcript,
      jsonl(assistantTurn(1, 0, [toolUse("a", "Read", { file_path: target })])),
    );
    await run(["--file", transcript]);
    expect(errors).toEqual([]);
    expect(output()).toContain("oversized Read (>3 lines, unbounded): 1");
  });
});

describe("run session report", () => {
  test("a missing transcript directory surfaces the read error", async () => {
    await run(["--project-dir", sandbox]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("|")).toContain("ENOENT");
  });

  test("no session transcripts fails", async () => {
    mkdirSync(projectDirectory(), { recursive: true });
    await run(["--project-dir", sandbox]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("|")).toContain("no session transcripts found under");
  });

  test("picks the newest session and sums worker cache reads", async () => {
    const directory = projectDirectory();
    mkdirSync(path.join(directory, "new-session", "subagents"), { recursive: true });
    const oldFile = path.join(directory, "old-session.jsonl");
    const newFile = path.join(directory, "new-session.jsonl");
    writeFileSync(oldFile, jsonl(assistantTurn(1, 0)));
    writeFileSync(newFile, jsonl(assistantTurn(5, 0)));
    setAge(oldFile, 120);
    const workerA = path.join(directory, "new-session", "subagents", "agent-a.jsonl");
    const workerB = path.join(directory, "new-session", "subagents", "agent-b.jsonl");
    const workerEmpty = path.join(directory, "new-session", "subagents", "agent-c.jsonl");
    writeFileSync(workerA, jsonl(assistantTurn(1, 2_000_000)));
    writeFileSync(workerB, jsonl(assistantTurn(1, 1_000_000)));
    writeFileSync(workerEmpty, "");

    await run(["--project-dir", sandbox]);

    const text = output();
    expect(text).toContain("=== coordinator new-session ===");
    expect(text).toContain("=== worker agent-a ===");
    expect(text).toContain("=== worker agent-b ===");
    expect(text).not.toContain("old-session");
    expect(text).not.toContain("agent-c ===");
    expect(text).toContain("workers: 3");
    expect(text).toContain("worker cache_read (M tok): 3.00");
  });

  test("--session selects a session; one without usage prints only the total", async () => {
    const directory = projectDirectory();
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "abc.jsonl"), jsonl({ type: "user" }));
    await run(["--project-dir", sandbox, "--session", "abc"]);
    const text = output();
    expect(text).not.toContain("=== coordinator");
    expect(text).toContain("workers: 0");
    expect(text).toContain("worker cache_read (M tok): 0.00");
  });
});

describe("run --stalled", () => {
  test("no session fails", async () => {
    mkdirSync(projectDirectory(), { recursive: true });
    await run(["--stalled", "--project-dir", sandbox]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("|")).toContain("no session transcripts found under");
  });

  test("a session without subagents says so and exits 0", async () => {
    const directory = projectDirectory();
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "s1.jsonl"), jsonl(assistantTurn(1, 0)));
    await run(["--stalled", "--project-dir", sandbox]);
    expect(process.exitCode).toBe(0);
    expect(output()).toContain("no subagent transcripts found for session s1");
  });

  test("fresh subagents are OK", async () => {
    const directory = projectDirectory();
    mkdirSync(path.join(directory, "s1", "subagents"), { recursive: true });
    writeFileSync(path.join(directory, "s1.jsonl"), jsonl(assistantTurn(1, 0)));
    writeFileSync(
      path.join(directory, "s1", "subagents", "agent-1.jsonl"),
      jsonl({ type: "user" }),
    );
    await run(["--stalled", "--project-dir", sandbox, "--session", "s1"]);
    expect(process.exitCode).toBe(0);
    expect(output()).toContain("--stalled OK — 1 subagent transcript(s) checked");
  });

  test("silent subagents are listed with their last step and exit 1", async () => {
    const directory = projectDirectory();
    const subagents = path.join(directory, "s1", "subagents");
    mkdirSync(subagents, { recursive: true });
    writeFileSync(path.join(directory, "s1.jsonl"), jsonl(assistantTurn(1, 0)));
    const idleOne = path.join(subagents, "agent-idle.jsonl");
    const pendingOne = path.join(subagents, "agent-pending.jsonl");
    writeFileSync(
      idleOne,
      jsonl({ type: "assistant", message: { content: [{ type: "text", text: "x" }] } }),
    );
    writeFileSync(
      pendingOne,
      jsonl({ type: "assistant", message: { content: [toolUse("t", "Bash")] } }),
    );
    setAge(idleOne, 20);
    setAge(pendingOne, 45);

    await run(["--stalled", "--project-dir", sandbox, "--minutes", "5", "--tool-minutes", "40"]);

    expect(process.exitCode).toBe(1);
    const text = output();
    expect(text).toContain("2/2 subagent(s) stalled (5m idle, 40m with a pending tool)");
    expect(text).toContain("agent-idle");
    expect(text).toContain("last step: assistant message");
    expect(text).toContain("agent-pending");
    expect(text).toContain("pending tool: Bash");
  });

  test("a pending tool inside the tool allowance is not stalled", async () => {
    const directory = projectDirectory();
    const subagents = path.join(directory, "s1", "subagents");
    mkdirSync(subagents, { recursive: true });
    writeFileSync(path.join(directory, "s1.jsonl"), jsonl(assistantTurn(1, 0)));
    const pendingOne = path.join(subagents, "agent-pending.jsonl");
    writeFileSync(
      pendingOne,
      jsonl({ type: "assistant", message: { content: [toolUse("t", "Bash")] } }),
    );
    setAge(pendingOne, 20);
    await run(["--stalled", "--project-dir", sandbox]);
    expect(process.exitCode).toBe(0);
    expect(output()).toContain("--stalled OK");
  });
});

describe("transcript parser lookup", () => {
  test("readLastStepFor reads a file through the host's parser", async () => {
    const file = path.join(sandbox, "t.jsonl");
    writeFileSync(file, jsonl({ type: "assistant", message: { content: [toolUse("t", "Edit")] } }));
    expect(await readLastStepFor(claudeHost)(file)).toEqual({
      step: "tool_use Edit",
      pendingTool: "Edit",
    });
    expect(Object.keys(transcriptParsers).toSorted()).toEqual(["claude-jsonl", "codex-jsonl"]);
  });
});

describe("run --stalled --run", () => {
  const runId = "run-x";

  const addWorker = (
    repo: string,
    ticket: string,
    options: { commit?: boolean; at?: string; run?: string } = {},
  ): string => {
    const directory = path.join(sandbox, `wt-${ticket}`);
    git(repo, "worktree", "add", "-q", "-b", `b-${ticket}`, directory);
    git(
      repo,
      "worktree",
      "lock",
      directory,
      "--reason",
      `emet run=${options.run ?? runId} ticket=${ticket} anchor=1 at=${options.at ?? "2020-01-01T00:00:00.000Z"}`,
    );
    if (options.commit) {
      writeFileSync(path.join(directory, "b.txt"), ticket);
      git(directory, "add", ".");
      git(directory, "commit", "-q", "-m", ticket);
    }
    return directory;
  };

  const writeEvent = (repo: string, ticket: string, outcome: "allowed" | "blocked"): void => {
    writeCompletionEvent(path.join(repo, ".git"), {
      runId,
      ticket,
      event: "SubagentStop",
      outcome,
      at: "2026-11-03T00:00:00.000Z",
      sessionId: null,
      branch: `b-${ticket}`,
      commits: 1,
    });
  };

  test("outside a git repository it fails", async () => {
    await run(["--stalled", "--run", runId]);
    expect(process.exitCode).toBe(1);
    expect(errors.some((line) => line.includes("not inside a git repository"))).toBe(true);
  });

  test("classifies each owned worktree and ignores other runs", async () => {
    const repo = makeRepo();
    addWorker(repo, "T-1", { commit: true });
    addWorker(repo, "T-2");
    addWorker(repo, "T-3", { run: "other-run" });
    writeEvent(repo, "T-1", "allowed");
    process.chdir(repo);

    await run(["--stalled", "--run", runId]);

    const text = output();
    expect(text).toContain("T-1  completed  commits=1");
    expect(text).toContain("T-2  stalled  commits=0");
    expect(text).not.toContain("T-3");
    expect(process.exitCode).toBe(1);
  });

  test("a fresh worker with a recent handoff note is working and exits 0", async () => {
    const repo = makeRepo();
    const directory = addWorker(repo, "T-1", { at: new Date().toISOString() });
    mkdirSync(path.join(directory, ".emet"), { recursive: true });
    writeFileSync(path.join(directory, ".emet", "handoff-T-1.md"), "note");
    process.chdir(repo);

    await run(["--stalled", "--run", runId, "--minutes", "30"]);

    expect(output()).toContain("T-1  working  commits=0");
    expect(process.exitCode).toBe(0);
  });

  test("--nudge spends the budget until the cap is exhausted", async () => {
    const repo = makeRepo();
    addWorker(repo, "T-2");
    process.chdir(repo);

    for (let attempt = 0; attempt < 7; attempt++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each run spends from the same persisted budget
      await run(["--stalled", "--run", runId, "--nudge"]);
    }

    const text = output();
    expect(text).toContain("nudge 1/");
    expect(text).toContain("exhausted — escalate, do not nudge again");
  });

  test("a detached worktree has no commit probe and is probe-unavailable", async () => {
    const repo = makeRepo();
    const directory = path.join(sandbox, "wt-detached");
    git(repo, "worktree", "add", "-q", "--detach", directory);
    git(
      repo,
      "worktree",
      "lock",
      directory,
      "--reason",
      `emet run=${runId} ticket=T-9 anchor=1 at=2020-01-01T00:00:00.000Z`,
    );
    process.chdir(repo);

    await run(["--stalled", "--run", runId]);

    expect(output()).toContain("T-9  probe-unavailable  commits=unavailable");
    expect(process.exitCode).toBe(1);
  });

  test("a branch whose worktree reflog is unreadable falls back to a trunk base", async () => {
    const repo = makeRepo();
    const directory = addWorker(repo, "T-5", { commit: true });
    rmSync(directory, { recursive: true, force: true });
    process.chdir(repo);

    await run(["--stalled", "--run", runId]);

    expect(output()).toMatch(/T-5 {2}\S+ {2}commits=/);
  });

  test("with no usable base branch the probe is unavailable", async () => {
    const repo = makeRepo();
    git(repo, "branch", "-m", "trunkless");
    const directory = addWorker(repo, "T-6");
    rmSync(directory, { recursive: true, force: true });
    process.chdir(repo);

    await run(["--stalled", "--run", runId]);

    expect(output()).toContain("T-6  probe-unavailable  commits=unavailable");
  });
});
