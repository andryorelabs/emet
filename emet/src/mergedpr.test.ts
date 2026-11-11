import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeHost } from "./agenthost";
import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";
import {
  findMergedPullRequest,
  parseLocalBranches,
  parseMergedPullRequest,
  planMergedBranch,
  planMergedBranchSweep,
  protectedBranchNames,
  sweepMergedBranches,
} from "./mergedpr";

const TIP = "a".repeat(40);

describe("parseMergedPullRequest", () => {
  test("returns the pull request whose head commit is the tip", () => {
    const stdout = JSON.stringify([
      { number: 7, headRefOid: "b".repeat(40) },
      { number: 9, headRefOid: TIP },
    ]);
    expect(parseMergedPullRequest(stdout, TIP)).toBe(9);
  });

  test("returns null when no pull request has that head commit", () => {
    const stdout = JSON.stringify([{ number: 7, headRefOid: "b".repeat(40) }]);
    expect(parseMergedPullRequest(stdout, TIP)).toBeNull();
    expect(parseMergedPullRequest("[]", TIP)).toBeNull();
  });

  test("returns null for output it cannot interpret", () => {
    expect(parseMergedPullRequest("not json", TIP)).toBeNull();
    expect(parseMergedPullRequest('{"number":1}', TIP)).toBeNull();
    expect(parseMergedPullRequest(`[null, 3, {"headRefOid":"${TIP}"}]`, TIP)).toBeNull();
  });
});

describe("findMergedPullRequest", () => {
  test("asks for the branch and matches on the tip", async () => {
    const asked: string[] = [];
    const found = await findMergedPullRequest("fix/x", TIP, (branch) => {
      asked.push(branch);
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify([{ number: 12, headRefOid: TIP }]),
      });
    });
    expect(found).toBe(12);
    expect(asked).toEqual(["fix/x"]);
  });

  test("answers null when gh exits non-zero or throws", async () => {
    const failing = await findMergedPullRequest("fix/x", TIP, () =>
      Promise.resolve({ exitCode: 1, stdout: JSON.stringify([{ number: 12, headRefOid: TIP }]) }),
    );
    expect(failing).toBeNull();
    const throwing = await findMergedPullRequest("fix/x", TIP, () =>
      Promise.reject(new Error("gh missing")),
    );
    expect(throwing).toBeNull();
  });
});

describe("parseLocalBranches", () => {
  test("reads name and commit per line and skips blanks", () => {
    expect(parseLocalBranches(`main\t${TIP}\torigin/main\nfix/x\t${"b".repeat(40)}\t\n\n`)).toEqual(
      [
        { name: "main", sha: TIP, upstream: "origin/main" },
        { name: "fix/x", sha: "b".repeat(40), upstream: null },
      ],
    );
  });
});

describe("protectedBranchNames", () => {
  test("holds trunk, the default branch, the main checkout and the current branch", () => {
    expect([...protectedBranchNames("develop", "main", "develop", "fix/x")].toSorted()).toEqual([
      "develop",
      "fix/x",
      "main",
    ]);
    expect([...protectedBranchNames("develop", null, null, null)]).toEqual(["develop"]);
  });
});

describe("planMergedBranch", () => {
  const entry = {
    directory: "/r/.claude/worktrees/w1-integration",
    branch: "test/x",
    lockedReason: null,
  };
  const base = { branch: "test/x", pullRequest: 5, isAgentWorktree: true, isDirty: false };

  test("deletes a branch nothing has checked out", () => {
    expect(planMergedBranch({ ...base, entry: undefined })).toEqual({
      action: "delete",
      branch: "test/x",
      pullRequest: 5,
    });
  });

  test("removes a clean, unlocked agent worktree with its branch", () => {
    expect(planMergedBranch({ ...base, entry })).toEqual({
      action: "remove-worktree",
      branch: "test/x",
      pullRequest: 5,
      directory: entry.directory,
    });
  });

  test("keeps a branch checked out outside the agent worktree directory", () => {
    const plan = planMergedBranch({ ...base, entry, isAgentWorktree: false });
    expect(plan.action).toBe("keep");
    expect(plan).toMatchObject({
      reason: `${entry.directory}: checked out outside the agent worktree directory`,
    });
  });

  test("keeps a locked worktree, and a dirty one", () => {
    const locked = planMergedBranch({ ...base, entry: { ...entry, lockedReason: "held" } });
    expect(locked).toMatchObject({
      action: "keep",
      reason: `${entry.directory}: worktree is locked`,
    });
    const dirty = planMergedBranch({ ...base, entry, isDirty: true });
    expect(dirty).toMatchObject({
      action: "keep",
      reason: `${entry.directory}: worktree has uncommitted changes`,
    });
  });
});

/** A lookup that knows the merged pull requests by branch name and head commit. */
function mergedPullRequests(known: Record<string, { number: number; sha: string }>) {
  return (branch: string, tipSha: string): Promise<number | null> => {
    const match = known[branch];
    return Promise.resolve(match !== undefined && match.sha === tipSha ? match.number : null);
  };
}

describe("merged branch sweep against a real repository", () => {
  const originalDirectory = process.cwd();
  const originalExitCode = process.exitCode;
  let repo: string;
  let logSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

  const config: ForgeConfig = {
    ...DEFAULT_FORGE_CONFIG,
    repo: { ...DEFAULT_FORGE_CONFIG.repo, trunk: "develop", remote: "origin" },
    ticket: { ...DEFAULT_FORGE_CONFIG.ticket, branchPrefix: "cla" },
    landing: { mode: "pr" },
  };

  function git(...args: string[]): string {
    const result = Bun.spawnSync(["git", "-C", repo, ...args]);
    if (result.exitCode !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
    return result.stdout.toString().trim();
  }

  function commitOn(branch: string, file: string): string {
    git("checkout", "-q", "-b", branch, "develop");
    writeFileSync(path.join(repo, file), `${branch}\n`);
    git("add", ".");
    git("commit", "-q", "-m", branch);
    const sha = git("rev-parse", "HEAD");
    git("checkout", "-q", "develop");
    return sha;
  }

  function branchNames(): string[] {
    return git("branch", "--format=%(refname:short)")
      .split("\n")
      .filter((name) => name.length > 0)
      .toSorted();
  }

  function printed(): string {
    return logSpy.mock.calls.map((call) => String(call[0])).join("\n");
  }

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mergedpr-")));
    git("init", "-q", "-b", "develop");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    writeFileSync(path.join(repo, "file.txt"), "base\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    mkdirSync(path.join(repo, ".claude", "worktrees"), { recursive: true });
    process.chdir(repo);
    process.exitCode = 0;
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.chdir(originalDirectory);
    process.exitCode = originalExitCode ?? 0;
    rmSync(repo, { recursive: true, force: true });
  });

  test("deletes a squash-merged branch after trunk moved on", async () => {
    const sha = commitOn("test/raise-coverage", "a.txt");
    writeFileSync(path.join(repo, "a.txt"), "squashed and then changed again\n");
    git("add", ".");
    git("commit", "-q", "-m", "squash, then more work on trunk");

    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: mergedPullRequests({ "test/raise-coverage": { number: 457, sha } }),
    });

    expect(branchNames()).toEqual(["develop"]);
    expect(result.deleted).toEqual(["test/raise-coverage (PR #457 merged)"]);
    expect(printed()).toContain("Deleted 1 branch(es) whose pull request merged:");
    expect(process.exitCode).toBe(0);
  });

  test("keeps a branch whose tip is not the merged head commit", async () => {
    const sha = commitOn("fix/extra-local-commit", "a.txt");
    git("checkout", "-q", "fix/extra-local-commit");
    writeFileSync(path.join(repo, "b.txt"), "not pushed\n");
    git("add", ".");
    git("commit", "-q", "-m", "local only");
    git("checkout", "-q", "develop");

    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: mergedPullRequests({ "fix/extra-local-commit": { number: 1, sha } }),
    });

    expect(branchNames()).toEqual(["develop", "fix/extra-local-commit"]);
    expect(result.deleted).toEqual([]);
  });

  test("keeps everything when the lookup finds nothing", async () => {
    commitOn("chore/open-pr", "a.txt");
    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: () => Promise.resolve(null),
    });
    expect(branchNames()).toEqual(["chore/open-pr", "develop"]);
    expect(result).toEqual({ deleted: [], scaffolds: [], kept: [], failures: [] });
    expect(printed()).toBe("");
  });

  test("deletes a host scaffold branch that trunk already contains", async () => {
    git("branch", "worktree-release-notes");
    git("branch", "feature-without-commits");
    writeFileSync(path.join(repo, "a.txt"), "trunk moved on\n");
    git("add", ".");
    git("commit", "-q", "-m", "more work on trunk");

    const result = await sweepMergedBranches({
      config: { ...config, landing: { mode: "merge" } },
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: () => Promise.resolve(null),
    });

    expect(branchNames()).toEqual(["develop", "feature-without-commits"]);
    expect(result.scaffolds).toEqual(["worktree-release-notes"]);
    expect(printed()).toContain("Deleted 1 host scaffold branch(es) already in develop:");
  });

  test("keeps a scaffold branch that holds a commit, is checked out or tracks an upstream", async () => {
    commitOn("worktree-with-work", "a.txt");
    git("branch", "worktree-checked-out");
    const directory = path.join(repo, ".claude", "worktrees", "checked-out");
    git("worktree", "add", "-q", directory, "worktree-checked-out");
    git("branch", "worktree-tracking");
    git("branch", "-q", "--set-upstream-to", "develop", "worktree-tracking");

    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: () => Promise.resolve(null),
    });

    expect(result.scaffolds).toEqual([]);
    expect(branchNames()).toEqual([
      "develop",
      "worktree-checked-out",
      "worktree-tracking",
      "worktree-with-work",
    ]);
  });

  test("a dry run reports the scaffold branch and leaves it", async () => {
    git("branch", "worktree-release-notes");
    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: true,
      findMergedPullRequest: () => Promise.resolve(null),
    });
    expect(result.scaffolds).toEqual(["worktree-release-notes"]);
    expect(branchNames()).toEqual(["develop", "worktree-release-notes"]);
    expect(printed()).toContain("Would delete 1 host scaffold branch(es) already in develop:");
  });

  test("never considers trunk, the current branch, or worker and scaffold branches", async () => {
    const current = commitOn("fix/current", "a.txt");
    const worker = commitOn("cla-12-some-ticket", "b.txt");
    const scaffold = commitOn("worktree-agent-abc", "c.txt");
    git("checkout", "-q", "fix/current");
    const asked: string[] = [];

    await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: (branch) => {
        asked.push(branch);
        return Promise.resolve(1);
      },
    });

    expect(asked).toEqual([]);
    expect(branchNames()).toEqual([
      "cla-12-some-ticket",
      "develop",
      "fix/current",
      "worktree-agent-abc",
    ]);
    expect([current, worker, scaffold].every((sha) => sha.length === 40)).toBe(true);
  });

  test("removes a clean integration worktree together with its branch", async () => {
    const sha = commitOn("test/integration", "a.txt");
    const directory = path.join(repo, ".claude", "worktrees", "emet1w1-integration");
    git("worktree", "add", "-q", directory, "test/integration");

    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: mergedPullRequests({ "test/integration": { number: 3, sha } }),
    });

    expect(branchNames()).toEqual(["develop"]);
    expect(git("worktree", "list", "--porcelain")).not.toContain("emet1w1-integration");
    expect(result.deleted).toEqual([`test/integration (PR #3 merged, with worktree ${directory})`]);
  });

  test("keeps a dirty worktree, a locked one and one outside the agent directory", async () => {
    const dirtySha = commitOn("test/dirty", "a.txt");
    const lockedSha = commitOn("test/locked", "b.txt");
    const outsideSha = commitOn("test/outside", "c.txt");
    const dirty = path.join(repo, ".claude", "worktrees", "dirty");
    const locked = path.join(repo, ".claude", "worktrees", "locked");
    const outside = path.join(repo, "elsewhere");
    git("worktree", "add", "-q", dirty, "test/dirty");
    git("worktree", "add", "-q", locked, "test/locked");
    git("worktree", "add", "-q", outside, "test/outside");
    writeFileSync(path.join(dirty, "uncommitted.txt"), "work\n");
    git("worktree", "lock", locked, "--reason", "someone holds this");

    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: mergedPullRequests({
        "test/dirty": { number: 1, sha: dirtySha },
        "test/locked": { number: 2, sha: lockedSha },
        "test/outside": { number: 3, sha: outsideSha },
      }),
    });

    expect(branchNames()).toEqual(["develop", "test/dirty", "test/locked", "test/outside"]);
    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([
      `test/dirty (PR #1 merged) — ${dirty}: worktree has uncommitted changes`,
      `test/locked (PR #2 merged) — ${locked}: worktree is locked`,
      `test/outside (PR #3 merged) — ${outside}: checked out outside the agent worktree directory`,
    ]);
    git("worktree", "unlock", locked);
  });

  test("a dry run reports the branch and deletes nothing", async () => {
    const sha = commitOn("chore/release", "a.txt");
    const result = await sweepMergedBranches({
      config,
      host: claudeHost,
      dryRun: true,
      findMergedPullRequest: mergedPullRequests({ "chore/release": { number: 8, sha } }),
    });
    expect(branchNames()).toEqual(["chore/release", "develop"]);
    expect(result.deleted).toEqual(["chore/release (PR #8 merged)"]);
    expect(printed()).toContain("Would delete 1 branch(es) whose pull request merged:");
  });

  test("plans nothing when landing is a local merge", async () => {
    commitOn("chore/release", "a.txt");
    const plans = await planMergedBranchSweep({
      config: { ...config, landing: { mode: "merge" } },
      host: claudeHost,
      dryRun: false,
      findMergedPullRequest: () => Promise.resolve(1),
    });
    expect(plans).toEqual([]);
  });
});
