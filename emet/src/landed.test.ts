import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_FORGE_CONFIG } from "./config";
import {
  parseGithubIssueState,
  readGithubIssueState,
  resolveLandedVerdict,
  unownedReclaimVerdict,
  type LandedVerdict,
} from "./landed";
import type { ContentVerdict } from "./worktrees";

const input = { ticket: "CLA-9", branch: "cla-9-thing" };
const config = DEFAULT_FORGE_CONFIG;
const unknownTracker = () => Promise.resolve("unknown" as const);

function view(exitCode: number, stdout: string) {
  return () => Promise.resolve({ exitCode, stdout });
}

function classifyAs(verdict: ContentVerdict) {
  return (): Promise<ContentVerdict> => Promise.resolve(verdict);
}

describe("resolveLandedVerdict with a stubbed tracker", () => {
  test("a done ticket is landed even when its branch conflicts with trunk", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: () => Promise.resolve("done" as const),
      classifyContent: classifyAs("conflicted"),
    });
    expect(verdict).toBe("landed");
  });

  test("an open ticket is not landed even when its branch is merged", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: () => Promise.resolve("open" as const),
      classifyContent: classifyAs("merged"),
    });
    expect(verdict).toBe("not-landed");
  });

  test("a tracker error is never landed", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: () => {
        return Promise.reject(new Error("gh exploded"));
      },
      classifyContent: () => {
        return Promise.reject(new Error("no git either"));
      },
    });
    expect(verdict).toBe("unknown");
  });

  test("a tracker error is unknown even when the branch looks merged, and git is never consulted", async () => {
    let classifyCalls = 0;
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: () => {
        return Promise.reject(new Error("gh exploded"));
      },
      classifyContent: () => {
        classifyCalls += 1;
        return Promise.resolve("merged" as const);
      },
    });
    expect(verdict).toBe("unknown");
    expect(classifyCalls).toBe(0);
  });
});

describe("GitHub issue state mapping", () => {
  test("an open issue is open", () => {
    expect(parseGithubIssueState('{"state":"OPEN","stateReason":""}')).toBe("open");
  });

  test("an issue closed as completed is done", () => {
    expect(parseGithubIssueState('{"state":"CLOSED","stateReason":"COMPLETED"}')).toBe("done");
  });

  test("an issue closed as not planned is open", () => {
    expect(parseGithubIssueState('{"state":"CLOSED","stateReason":"NOT_PLANNED"}')).toBe("open");
  });

  test("unreadable output throws instead of answering unknown", () => {
    expect(() => parseGithubIssueState("not json")).toThrow();
    expect(() => parseGithubIssueState("null")).toThrow();
    expect(() => parseGithubIssueState('{"state":"MERGED"}')).toThrow();
  });

  test("a failing gh call rejects instead of answering unknown", async () => {
    const failure = await readGithubIssueState("CLA-9", view(1, "")).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
  });

  test("a ticket id without an issue number is unknown", async () => {
    expect(await readGithubIssueState("CLA-x", view(0, "{}"))).toBe("unknown");
  });

  test("a successful gh call maps through the runner", async () => {
    const state = await readGithubIssueState(
      "CLA-9",
      view(0, '{"state":"CLOSED","stateReason":"COMPLETED"}'),
    );
    expect(state).toBe("done");
  });

  test("a gh failure makes the whole verdict unknown, never landed", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: (ticket) => readGithubIssueState(ticket, view(1, "")),
      classifyContent: classifyAs("merged"),
    });
    expect(verdict).toBe("unknown");
  });
});

describe("resolveLandedVerdict falling back to git", () => {
  let repo = "";
  let originalCwd = "";

  function git(...args: string[]): void {
    const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  }

  function commitFile(name: string, content: string): void {
    writeFileSync(path.join(repo, name), content);
    git("add", name);
    git("commit", "-q", "-m", name);
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "landed-")));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    commitFile("base.txt", "base\n");
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(repo, { recursive: true, force: true });
  });

  const gitConfig = {
    ...config,
    repo: { trunk: "main", remote: "origin" },
    landing: { mode: "merge" as const },
  };

  test("a merged branch with no tracker answer is landed", async () => {
    git("checkout", "-q", "-b", "cla-9-thing");
    commitFile("a.txt", "a\n");
    git("checkout", "-q", "main");
    git("merge", "-q", "--ff-only", "cla-9-thing");
    const verdict = await resolveLandedVerdict(input, {
      config: gitConfig,
      readTrackerState: unknownTracker,
    });
    expect(verdict).toBe("landed");
  });

  test("an unmerged branch with no tracker answer is not landed", async () => {
    git("checkout", "-q", "-b", "cla-9-thing");
    commitFile("a.txt", "a\n");
    git("checkout", "-q", "main");
    const verdict = await resolveLandedVerdict(input, {
      config: gitConfig,
      readTrackerState: unknownTracker,
    });
    expect(verdict).toBe("not-landed");
  });

  test("a squash-merged branch on a moved trunk is landed via the tracker", async () => {
    git("checkout", "-q", "-b", "cla-9-thing");
    commitFile("a.txt", "a\n");
    git("checkout", "-q", "main");
    git("merge", "-q", "--squash", "cla-9-thing");
    git("commit", "-q", "-m", "squash");
    commitFile("a.txt", "a changed on trunk\n");
    const verdict = await resolveLandedVerdict(input, {
      config: gitConfig,
      readTrackerState: () => Promise.resolve("done" as const),
    });
    expect(verdict).toBe("landed");
  });

  test("an unresolvable trunk yields unknown", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config: { ...gitConfig, repo: { trunk: "missing", remote: "origin" } },
      readTrackerState: unknownTracker,
    });
    expect(verdict).toBe("unknown");
  });
});

describe("unownedReclaimVerdict", () => {
  const reclaimable = {
    workerTicket: "CLA-9" as string | null,
    landed: "landed" as LandedVerdict,
    clean: true,
    lockedByOther: false,
  };

  test("a worker-shaped, landed, clean, unlocked worktree is reclaimable", () => {
    expect(unownedReclaimVerdict(reclaimable)).toEqual({
      reclaimable: true,
      reason: "ticket landed and tree clean",
    });
  });

  test.each([
    [{ clean: false }, "dirty tree"],
    [{ landed: "not-landed" as const }, "ticket not landed"],
    [{ landed: "unknown" as const }, "ticket landed state unknown"],
    [{ lockedByOther: true }, "locked by another tool"],
    [{ workerTicket: null }, "branch is not worker-shaped"],
    [
      { lockedByOther: true, clean: false, landed: "not-landed" as const },
      "locked by another tool",
    ],
    [
      { workerTicket: null, landed: "unknown" as const, clean: false },
      "branch is not worker-shaped",
    ],
    [{ landed: "not-landed" as const, clean: false }, "ticket not landed"],
  ])("%o is not reclaimable: %s", (override, reason) => {
    expect(unownedReclaimVerdict({ ...reclaimable, ...override })).toEqual({
      reclaimable: false,
      reason,
    });
  });
});
