import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeHost } from "./agenthost-claude";
import { codexHost } from "./agenthost-codex";
import { currentExitCode } from "./exit-code";
import { isObject } from "./narrow";
import { present } from "./present";
import {
  briefLines,
  buildStatusReport,
  classifyChecks,
  closingIssueNumbers,
  groupWorkers,
  localLandedBranches,
  parseCheckRollup,
  parsePullRequests,
  parseRunIdentity,
  readCodexWorkers,
  run,
  summarize,
  type PullRequestStatus,
  type StatusDeps,
  type WaveInput,
  type WorkerSignal,
} from "./status";

const greenPullRequest: PullRequestStatus = {
  number: 1,
  state: "open",
  checks: "passing",
  mergeable: true,
  changesRequested: false,
};

function worker(overrides: Partial<WorkerSignal> = {}): WorkerSignal {
  return { ticket: "CLA-1", branch: "b", pullRequest: null, stalled: false, ...overrides };
}

function wave(workers: WorkerSignal[], runVerdict: WaveInput["runVerdict"] = "live"): WaveInput {
  return { runId: "emet20w2042651", runVerdict, workers };
}

const lockedReason = (ticket: string) =>
  `emet run=emet1w1000000 ticket=${ticket} anchor=1 at=2026-01-01T00:00:00Z`;

const stateOf = (input: WaveInput) => present(buildStatusReport([input], null).waves[0]).state;

describe("env-fault checks", () => {
  const nowMs = Date.parse("2026-01-01T12:00:00Z");
  const options = { nowMs, queuedStaleMs: 30 * 60 * 1000 };

  test("every failed check STARTUP_FAILURE is env-fault", () => {
    const checks = [{ status: "COMPLETED", conclusion: "STARTUP_FAILURE" }];
    expect(classifyChecks(checks, options)).toBe("env-fault");
  });

  test("a code failure wins over a startup failure", () => {
    const checks = [
      { status: "COMPLETED", conclusion: "STARTUP_FAILURE" },
      { status: "COMPLETED", conclusion: "FAILURE" },
    ];
    expect(classifyChecks(checks, options)).toBe("failing");
  });

  test("a check queued past the threshold is env-fault", () => {
    const checks = [{ status: "QUEUED", startedAt: "2026-01-01T11:00:00Z" }];
    expect(classifyChecks(checks, options)).toBe("env-fault");
  });

  test("a recently queued check is pending", () => {
    const checks = [{ status: "QUEUED", startedAt: "2026-01-01T11:55:00Z" }];
    expect(classifyChecks(checks, options)).toBe("pending");
  });

  test("a queued check with an invalid or missing start stays pending", () => {
    expect(classifyChecks([{ status: "QUEUED", startedAt: "nope" }], options)).toBe("pending");
    expect(classifyChecks([{ status: "QUEUED" }], options)).toBe("pending");
    expect(classifyChecks([{ status: "QUEUED", startedAt: "0001-01-01T00:00:00Z" }], options)).toBe(
      "pending",
    );
  });

  test("classifies none and passing", () => {
    expect(classifyChecks([], options)).toBe("none");
    expect(classifyChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }], options)).toBe(
      "passing",
    );
  });

  test("parsePullRequests reports env-fault and the wave needs a decision", () => {
    const map = parsePullRequests(
      JSON.stringify([
        {
          number: 1,
          state: "OPEN",
          headRefName: "a",
          statusCheckRollup: [{ status: "COMPLETED", conclusion: "STARTUP_FAILURE" }],
        },
      ]),
    );
    expect(map.get("a")).toMatchObject({ checks: "env-fault" });
    expect(
      stateOf(wave([worker({ pullRequest: { ...greenPullRequest, checks: "env-fault" } })])),
    ).toBe("needs-decision");
  });

  test("parseCheckRollup handles status contexts and malformed input", () => {
    const json = JSON.stringify({
      statusCheckRollup: [{ context: "ci/x", state: "FAILURE", targetUrl: "https://t" }],
    });
    expect(parseCheckRollup(json)).toEqual([
      { state: "FAILURE", name: "ci/x", detailsUrl: "https://t" },
    ]);
    expect(parseCheckRollup("[]")).toEqual([]);
    expect(parseCheckRollup("{}")).toEqual([]);
  });
});

describe("wave states", () => {
  test("working: a worker has no PR yet", () => {
    expect(
      stateOf(wave([worker(), worker({ ticket: "CLA-2", pullRequest: greenPullRequest })])),
    ).toBe("working");
  });

  test("checking: every worker has a PR and checks are pending", () => {
    expect(
      stateOf(wave([worker({ pullRequest: { ...greenPullRequest, checks: "pending" } })])),
    ).toBe("checking");
  });

  test("ready: all PRs green and mergeable", () => {
    expect(stateOf(wave([worker({ pullRequest: greenPullRequest })]))).toBe("ready");
  });

  test.each([
    ["stalled worker", worker({ stalled: true })],
    ["failing checks", worker({ pullRequest: { ...greenPullRequest, checks: "failing" } })],
    ["conflict", worker({ pullRequest: { ...greenPullRequest, mergeable: false } })],
    ["changes requested", worker({ pullRequest: { ...greenPullRequest, changesRequested: true } })],
    ["closed PR", worker({ pullRequest: { ...greenPullRequest, state: "closed" } })],
  ])("needs-decision: %s", (_label, signal) => {
    expect(
      stateOf(wave([worker({ ticket: "CLA-2", pullRequest: greenPullRequest }), signal])),
    ).toBe("needs-decision");
  });

  test("needs-decision: dead run without a PR", () => {
    expect(stateOf(wave([worker()], "dead"))).toBe("needs-decision");
  });
});

describe("report", () => {
  test("no active run reports idle, with and without --spec", () => {
    expect(buildStatusReport([], null)).toEqual({ state: "idle", spec: null, waves: [] });
    expect(buildStatusReport([], "20").state).toBe("idle");
    expect(summarize(buildStatusReport([], null))).toContain("idle");
  });

  test("--spec filters waves by the spec in the run id", () => {
    const other: WaveInput = { ...wave([worker()]), runId: "emet21w1000000" };
    const report = buildStatusReport([wave([worker()]), other], "21");
    expect(report.waves.map((w) => w.runId)).toEqual(["emet21w1000000"]);
  });

  test("overall state is the most urgent wave", () => {
    const blocked: WaveInput = { ...wave([worker({ stalled: true })]), runId: "emet20w1000000" };
    const ready = wave([worker({ pullRequest: greenPullRequest })]);
    expect(buildStatusReport([ready, blocked], null).state).toBe("needs-decision");
  });

  test("JSON shape is stable", () => {
    const report = buildStatusReport([wave([worker({ pullRequest: greenPullRequest })])], "20");
    expect(Object.keys(report)).toEqual(["state", "spec", "waves"]);
    expect(Object.keys(present(report.waves[0]))).toEqual([
      "runId",
      "spec",
      "wave",
      "runVerdict",
      "state",
      "workers",
    ]);
    expect(Object.keys(present(present(report.waves[0]).workers[0]))).toEqual([
      "ticket",
      "branch",
      "pullRequest",
      "stalled",
      "state",
      "reason",
    ]);
  });

  test("summary is one line", () => {
    const line = summarize(buildStatusReport([wave([worker()])], null));
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("wave 2 working");
  });
});

describe("parsing and merging", () => {
  test("parseRunIdentity", () => {
    expect(parseRunIdentity("emet20w2042651")).toEqual({ spec: "20", wave: 2 });
    expect(parseRunIdentity("weird")).toEqual({ spec: null, wave: null });
  });

  test("parseRunIdentity reads slug specs, using the last w before the digits", () => {
    expect(parseRunIdentity("forgelocal-trackerw3231500")).toEqual({
      spec: "local-tracker",
      wave: 3,
    });
    expect(parseRunIdentity("forgeaw2042651")).toEqual({ spec: "a", wave: 2 });
    expect(parseRunIdentity("forgew3xw1123456")).toEqual({ spec: "w3x", wave: 1 });
    expect(parseRunIdentity("forgeapi-w2w10123456")).toEqual({ spec: "api-w2", wave: 10 });
    expect(parseRunIdentity("forgeshow2042651")).toEqual({ spec: "sho", wave: 2 });
  });

  test("localLandedBranches marks a squash-landed worker branch as merged", async () => {
    const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-status-")));
    const original = process.cwd();
    const sh = (...args: string[]) => {
      const result = Bun.spawnSync(["git", "-C", repo, ...args]);
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    };
    try {
      sh("init", "-q", "-b", "main");
      sh("config", "user.email", "t@example.com");
      sh("config", "user.name", "T");
      writeFileSync(path.join(repo, "f"), "1\n");
      sh("add", "f");
      sh("commit", "-q", "-m", "init");
      sh("checkout", "-q", "-b", "cla-1-landed");
      writeFileSync(path.join(repo, "g"), "2\n");
      sh("add", "g");
      sh("commit", "-q", "-m", "work");
      sh("checkout", "-q", "-b", "cla-2-open", "main");
      writeFileSync(path.join(repo, "h"), "3\n");
      sh("add", "h");
      sh("commit", "-q", "-m", "other work");
      sh("checkout", "-q", "main");
      sh("merge", "-q", "--squash", "cla-1-landed");
      sh("commit", "-q", "-m", "squash");
      process.chdir(repo);
      const landed = await localLandedBranches(
        [
          { directory: "/x/agent-1", branch: "cla-1-landed", lockedReason: lockedReason("CLA-1") },
          { directory: "/x/agent-2", branch: "cla-2-open", lockedReason: lockedReason("CLA-2") },
        ],
        { repo: { trunk: "main", remote: "origin" } },
      );
      expect([...landed.keys()]).toEqual(["cla-1-landed"]);
      expect(landed.get("cla-1-landed")?.state).toBe("merged");
    } finally {
      process.chdir(original);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("run never calls gh in merge landing mode", async () => {
    const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-status-run-")));
    const stubDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-status-gh-")));
    const marker = path.join(stubDirectory, "gh-was-called");
    const originalCwd = process.cwd();
    const originalPath = process.env.PATH;
    const originalExitCode = process.exitCode;
    const originalLog = console.log;
    try {
      writeFileSync(
        path.join(repo, "emet.config.json"),
        JSON.stringify({ version: 1, landing: { mode: "merge" } }),
      );
      const identity = ["-c", "user.email=t@example.com", "-c", "user.name=T"];
      for (const args of [
        ["init", "-q", "-b", "main"],
        ["add", "emet.config.json"],
        [...identity, "commit", "-q", "-m", "init"],
      ]) {
        const result = Bun.spawnSync(["git", "-C", repo, ...args]);
        if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      }
      const stub = path.join(stubDirectory, "gh");
      writeFileSync(stub, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
      chmodSync(stub, 0o755);
      process.env.PATH = `${stubDirectory}:${originalPath ?? ""}`;
      process.chdir(repo);
      process.exitCode = undefined;
      console.log = (): undefined => undefined;
      await run([]);
      console.log = originalLog;
      expect(existsSync(marker)).toBe(false);
      expect(currentExitCode()).toBe(0);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
      process.env.PATH = originalPath;
      process.chdir(originalCwd);
      rmSync(repo, { recursive: true, force: true });
      rmSync(stubDirectory, { recursive: true, force: true });
    }
  });

  test("parsePullRequests maps gh JSON", () => {
    const map = parsePullRequests(
      JSON.stringify([
        {
          number: 5,
          state: "OPEN",
          headRefName: "a",
          mergeable: "MERGEABLE",
          reviewDecision: null,
          statusCheckRollup: [
            { status: "COMPLETED", conclusion: "SUCCESS" },
            { status: "IN_PROGRESS" },
          ],
        },
        {
          number: 6,
          state: "OPEN",
          headRefName: "b",
          mergeable: "CONFLICTING",
          statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }],
        },
        { number: 7, state: "MERGED", headRefName: "c", statusCheckRollup: [] },
      ]),
    );
    expect(map.get("a")).toMatchObject({ checks: "pending", mergeable: true });
    expect(map.get("b")).toMatchObject({ checks: "failing", mergeable: false });
    expect(map.get("c")).toMatchObject({ state: "merged", checks: "none" });
  });

  test("groupWorkers merges reservations, worktrees, PRs and stalled", () => {
    const waves = groupWorkers(
      [
        {
          directory: "/w/1",
          branch: "br",
          lockedReason: "emet run=emet20w2042651 ticket=CLA-1 anchor=1 at=x",
        },
      ],
      [
        { runId: "emet20w2042651", ticket: "CLA-1" },
        { runId: "emet20w2042651", ticket: "CLA-2" },
      ],
      new Map([["br", greenPullRequest]]),
      new Set(["/w/1"]),
      new Map([["emet20w2042651", "live"]]),
    );
    expect(waves).toHaveLength(1);
    expect(present(waves[0]).workers).toEqual([
      { ticket: "CLA-1", branch: "br", pullRequest: greenPullRequest, stalled: true },
      { ticket: "CLA-2", branch: null, pullRequest: null, stalled: false },
    ]);
  });
});

describe("wave PR lookup", () => {
  test("closingIssueNumbers reads Closes lines", () => {
    expect(closingIssueNumbers("intro\n\nCloses #25, #26, #28\n")).toEqual(["25", "26", "28"]);
    expect(closingIssueNumbers("Refs: #4")).toEqual([]);
  });

  test("workers find the wave PR through its Closes line", () => {
    const pullRequests = parsePullRequests(
      JSON.stringify([
        {
          number: 99,
          state: "OPEN",
          headRefName: "feat/wave",
          body: "x\n\nCloses #25, #26",
          mergeable: "MERGEABLE",
          statusCheckRollup: [{ status: "IN_PROGRESS" }],
        },
      ]),
    );
    const [group] = groupWorkers(
      [],
      [{ runId: "emet20w2111111", ticket: "CLA-25" }],
      pullRequests,
      new Set(),
      new Map([["emet20w2111111", "live"]]),
    );
    expect(present(present(group).workers[0]).pullRequest?.number).toBe(99);
    expect(present(present(group).workers[0]).pullRequest?.checks).toBe("pending");
  });
});

describe("Codex workers judged by their jsonl", () => {
  const RUN_ID = "emet20w2042651";
  const entry = {
    directory: "/w/agent-CLA-9",
    branch: "worktree-agent-CLA-9",
    lockedReason: `emet run=${RUN_ID} ticket=CLA-9 anchor=1 at=x`,
  };

  function seedWorker(runsRoot: string): string {
    const codexDir = path.join(runsRoot, RUN_ID, "codex");
    mkdirSync(codexDir, { recursive: true });
    const jsonlPath = path.join(codexDir, "CLA-9.jsonl");
    writeFileSync(jsonlPath, `${JSON.stringify({ type: "thread.started", thread_id: "th-9" })}\n`);
    writeFileSync(
      path.join(codexDir, "CLA-9.state.json"),
      JSON.stringify({
        pid: 36,
        threadId: null,
        startedAt: new Date().toISOString(),
        jsonlPath,
        cwd: entry.directory,
        pidNamespace: "pid:[sandbox]",
      }),
    );
    return jsonlPath;
  }

  test("a worker in another pid namespace is live while its jsonl grows, done on turn.completed", () => {
    const runsRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "status-codex-")));
    try {
      const jsonlPath = seedWorker(runsRoot);
      const probe = { idleMs: 60_000, pidNamespace: "pid:[host]", isPidAlive: () => false };
      appendFileSync(jsonlPath, `${JSON.stringify({ type: "item.started" })}\n`);
      const live = readCodexWorkers([entry], runsRoot, probe);
      expect(live.get(entry.directory)).toEqual({ liveness: "live", threadId: "th-9" });

      const [liveWave] = groupWorkers(
        [entry],
        [],
        new Map(),
        new Set(),
        new Map([[RUN_ID, "live"]]),
        live,
      );
      expect(present(liveWave).workers[0]).toMatchObject({
        liveness: "live",
        threadId: "th-9",
        stalled: false,
      });
      expect(
        present(present(buildStatusReport([present(liveWave)], null).waves[0]).workers[0]).state,
      ).toBe("working");

      appendFileSync(jsonlPath, `${JSON.stringify({ type: "turn.completed" })}\n`);
      const done = readCodexWorkers([entry], runsRoot, probe);
      expect(done.get(entry.directory)?.liveness).toBe("done");

      const stale = readCodexWorkers([entry], runsRoot, { ...probe, idleMs: -1 });
      expect(stale.get(entry.directory)?.liveness).toBe("done");
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });

  test("a silent worker is stalled from the jsonl and unknown workers are skipped", () => {
    const runsRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "status-codex-")));
    try {
      seedWorker(runsRoot);
      const probe = { idleMs: -1, pidNamespace: "pid:[host]", isPidAlive: () => true };
      const unowned = { directory: "/w/x", branch: "x", lockedReason: null };
      const workers = readCodexWorkers([entry, unowned], runsRoot, probe);
      expect([...workers.keys()]).toEqual([entry.directory]);
      const [stalledWave] = groupWorkers([entry], [], new Map(), new Set(), new Map(), workers);
      expect(present(stalledWave).workers[0]).toMatchObject({ liveness: "stalled", stalled: true });
    } finally {
      rmSync(runsRoot, { recursive: true, force: true });
    }
  });
});

describe("briefLines", () => {
  test("idle prints one state line and how to start", () => {
    const lines = briefLines(buildStatusReport([], null));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("idle");
  });

  test("needs-decision names what waits on a person and the next action", () => {
    const lines = briefLines(buildStatusReport([wave([worker({ stalled: true })])], null));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("worker stalled");
    expect(lines[2]).toContain("decide");
  });

  test("ready waits on a person to land", () => {
    const lines = briefLines(
      buildStatusReport([wave([worker({ pullRequest: greenPullRequest })])], null),
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("ready");
  });

  test("working has no waiting line and never exceeds three lines", () => {
    const lines = briefLines(buildStatusReport([wave([worker()])], null));
    expect(lines).toHaveLength(2);
    expect(lines.length).toBeLessThanOrEqual(3);
  });
});

function gitAt(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function integratedSpecBranch(repo: string): string {
  const gitIn = (...args: string[]): string => gitAt(repo, ...args);
  gitIn("init", "-q", "-b", "main");
  gitIn("config", "user.email", "t@example.com");
  gitIn("config", "user.name", "Test");
  gitIn("config", "commit.gpgsign", "false");
  writeFileSync(path.join(repo, "a.txt"), "a\n");
  gitIn("add", "a.txt");
  gitIn("commit", "-q", "-m", "init");
  gitIn("branch", "spec/5");
  gitIn("checkout", "-q", "-b", "spec/5-w1", "spec/5");
  writeFileSync(path.join(repo, "b.txt"), "b\n");
  gitIn("add", "b.txt");
  gitIn("commit", "-q", "-m", "wave");
  gitIn("checkout", "-q", "main");
  const tip = gitIn(
    "commit-tree",
    gitIn("merge-tree", "--write-tree", "spec/5", "spec/5-w1"),
    "-p",
    "spec/5",
    "-p",
    "spec/5-w1",
    "-m",
    "integrate",
    "-m",
    "Emet-Wave: 1\nEmet-Tickets: a,b",
  );
  gitIn("update-ref", "refs/heads/spec/5", tip);
  return tip;
}

describe("run", () => {
  const RUN_ID = "emet523w7172506";
  const ownedEntry = (directory: string, ticket: string, branch: string) => ({
    directory,
    branch,
    lockedReason: `emet run=${RUN_ID} ticket=${ticket} anchor=1 at=2026-01-01T00:00:00Z`,
  });
  let repo = "";
  let scratch = "";
  let stdout: string[] = [];
  let stderr: string[] = [];
  let restoreFns: (() => void)[] = [];
  const originalExitCode = process.exitCode;
  const originalPath = process.env.PATH;

  function makeRepo(config: Record<string, unknown> = { version: 1 }): void {
    writeFileSync(path.join(repo, "emet.config.json"), JSON.stringify(config));
  }

  function deps(overrides: Partial<StatusDeps> = {}): Partial<StatusDeps> {
    return {
      resolveRepoRoot: () => Promise.resolve(repo),
      listOccupiedSlots: () => Promise.resolve([]),
      listReservations: () => Promise.resolve([]),
      listWorktreeEntries: () => Promise.resolve([]),
      fetchPullRequests: () => Promise.resolve(new Map()),
      findStalledTranscripts: () => Promise.resolve([]),
      ...overrides,
    };
  }

  function parsedReport(): unknown {
    const parsed: unknown = JSON.parse(present(stdout[0]));
    return parsed;
  }

  function workersOf(): Record<string, unknown>[] {
    const parsed = parsedReport();
    if (!isObject(parsed) || !Array.isArray(parsed.waves)) throw new Error("malformed report");
    const waves: unknown[] = parsed.waves;
    return waves.flatMap((item) => {
      if (!isObject(item) || !Array.isArray(item.workers)) return [];
      const workers: unknown[] = item.workers;
      return workers.filter(isObject);
    });
  }

  const missingTranscripts = (): Partial<StatusDeps> => ({
    resolveAgentHost: () => ({
      ...claudeHost,
      workerTranscriptRoot: () => path.join(scratch, "missing", "slug"),
    }),
  });

  function stubGh(script: string): void {
    const stub = path.join(scratch, "gh");
    writeFileSync(stub, `#!/bin/sh\n${script}\n`);
    chmodSync(stub, 0o755);
    process.env.PATH = `${scratch}:${originalPath ?? ""}`;
  }

  function withRealFetch(ticket: string, branch: string): Partial<StatusDeps> {
    const { fetchPullRequests: _unused, ...rest } = deps(missingTranscripts());
    return {
      ...rest,
      listWorktreeEntries: () =>
        Promise.resolve([ownedEntry(path.join(scratch, "wt", `agent-${ticket}`), ticket, branch)]),
    };
  }

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-status-repo-")));
    scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-status-scratch-")));
    stdout = [];
    stderr = [];
    process.exitCode = 0;
    const log = spyOn(console, "log").mockImplementation((line: unknown) => {
      stdout.push(String(line));
    });
    const error = spyOn(console, "error").mockImplementation((line: unknown) => {
      stderr.push(String(line));
    });
    restoreFns = [
      () => {
        log.mockRestore();
      },
      () => {
        error.mockRestore();
      },
    ];
  });

  afterEach(() => {
    for (const restore of restoreFns) restore();
    process.exitCode = originalExitCode ?? 0;
    process.env.PATH = originalPath;
    rmSync(repo, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  describe("spec branch", () => {
    test("reports specBranch when landing.unit is spec and --spec is given", async () => {
      makeRepo({ version: 1, landing: { unit: "spec" } });
      const tip = integratedSpecBranch(repo);
      await run(["--spec", "5"], deps());
      expect(parsedReport()).toMatchObject({
        specBranch: { branch: "spec/5", tip, integratedWaves: [1] },
      });
    });

    test("omits specBranch for the wave unit and without --spec", async () => {
      makeRepo({ version: 1, landing: { unit: "wave" } });
      integratedSpecBranch(repo);
      await run(["--spec", "5"], deps());
      expect(parsedReport()).not.toHaveProperty("specBranch");
      stdout = [];
      makeRepo({ version: 1, landing: { unit: "spec" } });
      await run([], deps());
      expect(parsedReport()).not.toHaveProperty("specBranch");
    });
  });

  test("--help prints usage and does nothing else", async () => {
    await run(["--help"], deps());
    expect(stdout[0]).toContain("status [--spec <id>]");
    expect(currentExitCode()).toBe(0);
  });

  test("--spec without a value exits 2", async () => {
    await run(["--spec"], deps());
    expect(stderr[0]).toContain("--spec requires a value");
    expect(currentExitCode()).toBe(2);
    expect(stdout).toEqual([]);
  });

  test("outside a repository exits 2", async () => {
    await run([], deps({ resolveRepoRoot: () => Promise.resolve(null) }));
    expect(stderr[0]).toContain("not inside a git repository");
    expect(currentExitCode()).toBe(2);
  });

  test("an unexpected failure exits 3 and is reported", async () => {
    makeRepo();
    const failure = new Error("slots unreadable");
    await run([], deps({ listOccupiedSlots: () => Promise.reject(failure) }));
    expect(stderr[0]).toBe(String(failure));
    expect(currentExitCode()).toBe(3);
  });

  test("an idle host reports idle", async () => {
    makeRepo();
    await run([], deps());
    expect(stderr).toEqual([]);
    expect(parsedReport()).toMatchObject({ state: "idle" });
    expect(stdout[1]).toContain("idle");
    expect(currentExitCode()).toBe(0);
  });

  test("merges slots, reservations and a stalled transcript into one report", async () => {
    makeRepo();
    const worktree = path.join(scratch, "wt", "agent-abc");
    const projects = path.join(scratch, "projects");
    const newerDirectory = path.join(projects, "slug", "session", "subagents");
    mkdirSync(newerDirectory, { recursive: true });
    const newer = path.join(newerDirectory, "agent-abc.jsonl");
    writeFileSync(newer, "{}\n");
    const olderDirectory = path.join(projects, "slug", "older", "subagents");
    mkdirSync(olderDirectory, { recursive: true });
    const older = path.join(olderDirectory, "agent-abc.jsonl");
    writeFileSync(older, "{}\n");
    utimesSync(older, new Date(2020, 0, 1), new Date(2020, 0, 1));
    const seen: string[][] = [];
    await run(
      [],
      deps({
        listOccupiedSlots: () =>
          Promise.resolve([
            {
              index: 1,
              verdict: "live",
              holder: {
                runId: RUN_ID,
                anchorPid: 1,
                ticket: "CLA-1",
                sessionSlug: "s",
                repoRoot: repo,
                pid: 1,
                worktree: repo,
                acquiredAt: 1,
              },
            },
          ]),
        listReservations: () =>
          Promise.resolve([
            {
              runId: RUN_ID,
              anchorPid: 999_999_999,
              ticket: "CLA-1",
              reservedAt: 1,
              sessionSlug: "s",
            },
            {
              runId: "emet9w9000000",
              anchorPid: 999_999_999,
              anchorStartToken: "token",
              ticket: "CLA-2",
              reservedAt: 1,
              sessionSlug: "s",
            },
          ]),
        listWorktreeEntries: () =>
          Promise.resolve([
            ownedEntry(worktree, "CLA-3", "cla-3-x"),
            { directory: "/elsewhere", branch: "b", lockedReason: null },
          ]),
        resolveAgentHost: () => ({
          ...claudeHost,
          workerTranscriptRoot: () => path.join(projects, "slug"),
        }),
        findStalledTranscripts: (paths) => {
          seen.push([...paths]);
          return Promise.resolve([
            {
              taskId: "agent-abc",
              path: present(paths[0]),
              minutesSinceLastWrite: 99,
              lastStep: "tool_use",
              pendingTool: null,
            },
          ]);
        },
      }),
    );
    expect(seen).toEqual([[newer]]);
    expect(parsedReport()).toMatchObject({ state: "needs-decision" });
    expect(JSON.stringify(parsedReport())).toContain('"runVerdict":"dead"');
    const workers = workersOf();
    expect(workers.find((w) => w.ticket === "CLA-3")).toMatchObject({ stalled: true });
    expect(workers.map((w) => String(w.ticket)).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "CLA-1",
      "CLA-2",
      "CLA-3",
    ]);
  });

  test("a worktree with no transcript is not stalled", async () => {
    makeRepo();
    await run(
      [],
      deps({
        ...missingTranscripts(),
        listWorktreeEntries: () =>
          Promise.resolve([ownedEntry(path.join(scratch, "wt", "agent-zzz"), "CLA-4", "cla-4-x")]),
        findStalledTranscripts: () => Promise.reject(new Error("must not be called")),
      }),
    );
    expect(currentExitCode()).toBe(0);
    expect(workersOf()[0]).toMatchObject({ ticket: "CLA-4", stalled: false });
  });

  test("a directory that is not an agent worktree has no transcript", async () => {
    makeRepo();
    await run(
      [],
      deps({
        listWorktreeEntries: () =>
          Promise.resolve([ownedEntry(path.join(scratch, "plain"), "CLA-5", "cla-5-x")]),
        findStalledTranscripts: () => Promise.reject(new Error("must not be called")),
      }),
    );
    expect(currentExitCode()).toBe(0);
    expect(workersOf()[0]).toMatchObject({ stalled: false });
  });

  test("codex host: workers come from their jsonl state and other transcripts match by agent id", async () => {
    makeRepo({ version: 1, agentHost: "codex" });
    const codexDirectory = path.join(repo, ".emet", "runs", RUN_ID, "codex");
    mkdirSync(codexDirectory, { recursive: true });
    const codexWorktree = path.join(scratch, "wt", "agent-cdx");
    const jsonlPath = path.join(codexDirectory, "CLA-6.jsonl");
    writeFileSync(jsonlPath, `${JSON.stringify({ type: "thread.started", thread_id: "th-6" })}\n`);
    writeFileSync(
      path.join(codexDirectory, "CLA-6.state.json"),
      JSON.stringify({
        pid: 36,
        threadId: null,
        startedAt: new Date().toISOString(),
        jsonlPath,
        cwd: codexWorktree,
        pidNamespace: "pid:[sandbox]",
      }),
    );
    const transcriptRoot = path.join(scratch, "runs");
    mkdirSync(path.join(transcriptRoot, "r", "codex"), { recursive: true });
    writeFileSync(path.join(transcriptRoot, "r", "codex", "unrelated.jsonl"), "{}\n");
    const matching = path.join(transcriptRoot, "r", "codex", "run-oth.jsonl");
    writeFileSync(matching, "{}\n");
    const earlier = path.join(transcriptRoot, "s", "codex", "run-oth.jsonl");
    mkdirSync(path.dirname(earlier), { recursive: true });
    writeFileSync(earlier, "{}\n");
    utimesSync(earlier, new Date(2020, 0, 1), new Date(2020, 0, 1));
    const seen: string[][] = [];
    await run(
      [],
      deps({
        listWorktreeEntries: () =>
          Promise.resolve([
            ownedEntry(codexWorktree, "CLA-6", "cla-6-x"),
            ownedEntry(path.join(scratch, "wt", "agent-oth"), "CLA-7", "cla-7-x"),
          ]),
        resolveAgentHost: () => ({ ...codexHost, workerTranscriptRoot: () => transcriptRoot }),
        findStalledTranscripts: (paths) => {
          seen.push([...paths]);
          return Promise.resolve([]);
        },
      }),
    );
    expect(seen).toEqual([[matching]]);
    const workers = workersOf();
    expect(workers.find((w) => w.ticket === "CLA-6")).toMatchObject({ threadId: "th-6" });
    expect(workers.find((w) => w.ticket === "CLA-7")).toMatchObject({ stalled: false });
  });

  test("--brief prints at most three lines and no JSON", async () => {
    makeRepo();
    await run(["--brief"], deps());
    expect(stdout.length).toBeGreaterThan(0);
    expect(stdout.length).toBeLessThanOrEqual(3);
    expect(stdout[0]).toContain("idle");
    expect(stdout.join("\n")).not.toContain("{");
  });

  describe("pull requests through gh", () => {
    test("reads the open pull request of a worker branch", async () => {
      makeRepo();
      const prs = JSON.stringify([
        {
          number: 7,
          state: "OPEN",
          headRefName: "cla-8-x",
          mergeable: "MERGEABLE",
          statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
        },
      ]);
      stubGh(`cat <<'JSON'\n${prs}\nJSON`);
      await run([], withRealFetch("CLA-8", "cla-8-x"));
      expect(workersOf()[0]).toMatchObject({
        ticket: "CLA-8",
        pullRequest: { number: 7, state: "open", checks: "passing", mergeable: true },
      });
    });

    test("a failing gh yields no pull requests instead of an error", async () => {
      makeRepo();
      stubGh("exit 1");
      await run([], withRealFetch("CLA-9", "cla-9-x"));
      expect(currentExitCode()).toBe(0);
      expect(workersOf()[0]).toMatchObject({ pullRequest: null });
    });
  });
});
