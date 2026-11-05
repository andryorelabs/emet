import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildStatusReport,
  closingIssueNumbers,
  groupWorkers,
  localLandedBranches,
  parsePullRequests,
  parseRunIdentity,
  run,
  summarize,
  type PullRequestStatus,
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

const stateOf = (input: WaveInput) => buildStatusReport([input], null).waves[0]!.state;

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
    expect(Object.keys(report.waves[0]!)).toEqual([
      "runId",
      "spec",
      "wave",
      "runVerdict",
      "state",
      "workers",
    ]);
    expect(Object.keys(report.waves[0]!.workers[0]!)).toEqual([
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
      console.log = () => {};
      await run([]);
      console.log = originalLog;
      expect(existsSync(marker)).toBe(false);
      expect(process.exitCode ?? 0).toBe(0);
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
    expect(waves[0]!.workers).toEqual([
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
    expect(group!.workers[0]!.pullRequest?.number).toBe(99);
    expect(group!.workers[0]!.pullRequest?.checks).toBe("pending");
  });
});
