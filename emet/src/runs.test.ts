import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
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

import {
  classifyRun,
  completionEventPath,
  isAnchorAlive,
  isRunClosed,
  markRunClosed,
  resolveRunArtifactPath,
  readCompletionEvent,
  readProcessStartToken,
  readStallNudgeCount,
  resolveAnchorPid,
  recordStallNudge,
  resolveSessionSlug,
  writeCompletionEvent,
  type CompletionEvent,
} from "./runs";

const makeCommonDirectory = () => mkdtempSync(path.join(os.tmpdir(), "forge-runs-"));

describe("completion events and stall nudges", () => {
  const sampleEvent: CompletionEvent = {
    runId: "run-a",
    ticket: "CLA-50",
    event: "SubagentStop",
    outcome: "allowed",
    at: "2026-11-03T00:00:00.000Z",
    sessionId: "s1",
    branch: "cla-50-x",
    commits: 2,
  };

  test("events live under <common-dir>/.emet/runs/<id>/events/<ticket>.json and round-trip", () => {
    const commonDirectory = makeCommonDirectory();
    try {
      writeCompletionEvent(commonDirectory, sampleEvent);
      expect(completionEventPath(commonDirectory, "run-a", "CLA-50")).toBe(
        path.join(commonDirectory, ".emet", "runs", "run-a", "events", "CLA-50.json"),
      );
      expect(readCompletionEvent(commonDirectory, "run-a", "CLA-50")).toEqual(sampleEvent);
      expect(readCompletionEvent(commonDirectory, "run-a", "CLA-99")).toBeNull();
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });

  test("a corrupt event file reads as null, and unsafe ids are rejected", () => {
    const commonDirectory = makeCommonDirectory();
    try {
      writeCompletionEvent(commonDirectory, sampleEvent);
      writeFileSync(completionEventPath(commonDirectory, "run-a", "CLA-50"), "{nope");
      expect(readCompletionEvent(commonDirectory, "run-a", "CLA-50")).toBeNull();
      expect(() => completionEventPath(commonDirectory, "../x", "CLA-50")).toThrow();
      expect(() => completionEventPath(commonDirectory, "run-a", "a/b")).toThrow();
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });

  test("nudges are granted up to the cap, persisted, and never refilled", () => {
    const commonDirectory = makeCommonDirectory();
    try {
      expect(recordStallNudge(commonDirectory, "run-a", "CLA-50", 2)).toEqual({
        granted: true,
        count: 1,
        cap: 2,
      });
      expect(recordStallNudge(commonDirectory, "run-a", "CLA-50", 2)).toEqual({
        granted: true,
        count: 2,
        cap: 2,
      });
      expect(recordStallNudge(commonDirectory, "run-a", "CLA-50", 2)).toEqual({
        granted: false,
        count: 2,
        cap: 2,
      });
      expect(readStallNudgeCount(commonDirectory, "run-a", "CLA-50")).toBe(2);
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });

  test("a corrupt nudge counter counts as exhausted, never as a refill", () => {
    const commonDirectory = makeCommonDirectory();
    try {
      recordStallNudge(commonDirectory, "run-a", "CLA-50", 3);
      const nudgeFile = path.join(
        commonDirectory,
        ".emet",
        "runs",
        "run-a",
        "nudges",
        "CLA-50.json",
      );
      expect(JSON.parse(readFileSync(nudgeFile, "utf8"))).toEqual({ count: 1 });
      writeFileSync(nudgeFile, "garbage");
      expect(recordStallNudge(commonDirectory, "run-a", "CLA-50", 3).granted).toBe(false);
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });
});

describe("classifyRun", () => {
  test("live: anchor process is still running", () => {
    const verdict = classifyRun(4242, "slug", "run-a", {
      isAnchorAliveFn: () => true,
      transcriptMtimeFn: () => null,
    });
    expect(verdict).toBe("live");
  });

  test("idle: anchor is gone but the transcript was touched recently", () => {
    const now = 1_000_000_000;
    const verdict = classifyRun(4242, "slug", "run-a", {
      now,
      idleThresholdMs: 90 * 60_000,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - 10 * 60_000,
    });
    expect(verdict).toBe("idle");
  });

  test("dead: anchor is gone and the transcript is older than the idle threshold", () => {
    const now = 1_000_000_000;
    const verdict = classifyRun(4242, "slug", "run-a", {
      now,
      idleThresholdMs: 90 * 60_000,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - 200 * 60_000,
    });
    expect(verdict).toBe("dead");
  });

  test("dead: anchor is gone and the transcript is unreadable", () => {
    const verdict = classifyRun(4242, "slug", "run-a", {
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => null,
    });
    expect(verdict).toBe("dead");
  });

  test("a transcript touched exactly at the threshold still counts as idle", () => {
    const now = 1_000_000_000;
    const idleThresholdMs = 90 * 60_000;
    const verdict = classifyRun(4242, "slug", "run-a", {
      now,
      idleThresholdMs,
      isAnchorAliveFn: () => false,
      transcriptMtimeFn: () => now - idleThresholdMs,
    });
    expect(verdict).toBe("idle");
  });
});

describe("resolveSessionSlug", () => {
  test("replaces every path separator with a dash", () => {
    expect(resolveSessionSlug("/home/andryore/code/andryore-dev")).toBe(
      "-home-andryore-code-andryore-dev",
    );
  });
});

describe("resolveSessionSlug with dots", () => {
  test("replaces dots as well as separators", () => {
    expect(resolveSessionSlug("/Users/first.last/repo")).toBe("-Users-first-last-repo");
  });
});

describe("process start token", () => {
  test("reads a numeric start token for a live process", () => {
    const token = readProcessStartToken(process.pid);
    if (existsSync("/proc/self/stat")) expect(token).toMatch(/^\d+$/);
    else expect(token).toBeUndefined();
  });

  test("returns undefined for a missing process", () => {
    expect(readProcessStartToken(2_000_000_000)).toBeUndefined();
  });

  test("classifyRun forwards the token to the liveness check", () => {
    const received: Array<string | undefined> = [];
    classifyRun(4242, "slug", "run-a", {
      anchorStartToken: "777",
      isAnchorAliveFn: (_pid, token) => {
        received.push(token);
        return true;
      },
    });
    expect(received).toEqual(["777"]);
  });

  test("a legacy run without a token is classified by the injected check with no token", () => {
    const received: Array<string | undefined> = [];
    classifyRun(4242, "slug", "run-a", {
      isAnchorAliveFn: (_pid, token) => {
        received.push(token);
        return true;
      },
    });
    expect(received).toEqual([undefined]);
  });

  test("a mismatched start token reports not alive", () => {
    expect(isAnchorAlive(process.pid, "not-a-real-token")).toBe(false);
  });
});

describe("resolveAnchorPid without procfs", () => {
  const tree: Record<number, string> = {
    300: "  200 bun\n",
    200: "  100 /bin/zsh\n",
    100: "  1 /usr/local/bin/claude\n",
  };
  const reader = {
    hasProcfs: () => false,
    readFile: (): string => {
      throw new Error("no procfs");
    },
    runPs: (pid: number) => tree[pid] ?? null,
  };

  test("resolves the claude ancestor via ps", () => {
    expect(resolveAnchorPid(300, reader)).toBe(100);
    expect(isAnchorAlive(100, undefined, reader)).toBe(true);
    expect(isAnchorAlive(200, undefined, reader)).toBe(false);
  });

  test("throws when no ancestor is claude", () => {
    const noClaude = { ...reader, runPs: (pid: number) => (pid === 300 ? "200 bun" : null) };
    expect(() => resolveAnchorPid(300, noClaude)).toThrow("no ancestor");
  });
});

describe("closed-run marker", () => {
  test("round-trips and is false for an unmarked run", async () => {
    const commonDirectory = makeCommonDirectory();
    try {
      expect(await isRunClosed("run-a", { commonDirectory })).toBe(false);
      await markRunClosed("run-a", { commonDirectory, now: () => 42 });
      expect(await isRunClosed("run-a", { commonDirectory })).toBe(true);
      expect(await isRunClosed("run-b", { commonDirectory })).toBe(false);
      const written = JSON.parse(
        readFileSync(path.join(commonDirectory, ".emet", "runs", "run-a", "closed.json"), "utf8"),
      ) as unknown;
      expect(written).toMatchObject({ closedAt: 42 });
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });

  test("an unsafe run id is rejected", async () => {
    const commonDirectory = makeCommonDirectory();
    try {
      const outcome = await markRunClosed("../x", { commonDirectory }).catch(
        (error: unknown) => error,
      );
      expect(String(outcome)).toContain("unsafe run id");
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
    }
  });
});

const runGit = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "pipe" });

const makeRepo = () => {
  const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-artifact-")));
  const main = path.join(base, "main");
  const sibling = path.join(base, "sibling");
  mkdirSync(main);
  runGit(main, "init", "-q", "-b", "trunk");
  runGit(
    main,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "i",
  );
  runGit(main, "worktree", "add", "-q", "-b", "other", sibling);
  return { base, main, sibling };
};

describe("resolveRunArtifactPath", () => {
  test("an artifact written from one worktree is readable from a sibling", async () => {
    const { base, main, sibling } = makeRepo();
    try {
      const fromMain = await resolveRunArtifactPath("spec1", "approval.json", { repoRoot: main });
      expect(fromMain.writePath).toBe(
        path.join(main, ".git", ".emet", "runs", "spec1", "approval.json"),
      );
      expect(fromMain.readPath).toBeNull();
      mkdirSync(path.dirname(fromMain.writePath), { recursive: true });
      writeFileSync(fromMain.writePath, "{}");
      const fromSibling = await resolveRunArtifactPath("spec1", "approval.json", {
        repoRoot: sibling,
      });
      expect(fromSibling.readPath).toBe(fromMain.writePath);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("a legacy artifact under the repo root is still read", async () => {
    const { base, main } = makeRepo();
    try {
      const legacyPath = path.join(main, ".emet", "runs", "spec1", "tickets.json");
      mkdirSync(path.dirname(legacyPath), { recursive: true });
      writeFileSync(legacyPath, "{}");
      const resolved = await resolveRunArtifactPath("spec1", "tickets.json", { repoRoot: main });
      expect(resolved.readPath).toBe(legacyPath);
      expect(resolved.writePath).not.toBe(legacyPath);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("the shared location wins over the legacy one", async () => {
    const commonDirectory = makeCommonDirectory();
    const repoRoot = makeCommonDirectory();
    try {
      for (const directory of [commonDirectory, repoRoot]) {
        const file = path.join(directory, ".emet", "runs", "r", "materialize.json");
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, "{}");
      }
      const resolved = await resolveRunArtifactPath("r", "materialize.json", {
        repoRoot,
        commonDirectory,
      });
      expect(resolved.readPath).toBe(resolved.writePath);
      expect(resolved.writePath.startsWith(commonDirectory)).toBe(true);
    } finally {
      rmSync(commonDirectory, { recursive: true, force: true });
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
