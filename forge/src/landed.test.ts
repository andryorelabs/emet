import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_FORGE_CONFIG } from "./config";
import { resolveLandedVerdict } from "./landed";
import type { ContentVerdict } from "./worktrees";

const input = { ticket: "CLA-9", branch: "cla-9-thing" };
const config = DEFAULT_FORGE_CONFIG;
const unknownTracker = () => Promise.resolve("unknown" as const);

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

  test("a tracker error falls back to git content", async () => {
    const verdict = await resolveLandedVerdict(input, {
      config,
      readTrackerState: () => {
        return Promise.reject(new Error("gh exploded"));
      },
      classifyContent: classifyAs("diverged"),
    });
    expect(verdict).not.toBe("landed");
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
