import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { WaitForChecksDeps } from "./ci";
import { readJournalSegments } from "./journal";
import { run, specBranchName, waveBranchName } from "./specbranch";
import { waitForSpecChecks } from "./speclanding";

let repo = "";
let stateRoot = "";
let originalCwd = "";
let originalStateDir: string | undefined;
let originalPath: string | undefined;

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function commitFile(name: string, content: string): void {
  writeFileSync(path.join(repo, name), content);
  git(repo, "add", name);
  git(repo, "commit", "-q", "-m", `add ${name}`);
}

async function runCapturing(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const log = spyOn(console, "log").mockImplementation(() => undefined);
  const error = spyOn(console, "error").mockImplementation(() => undefined);
  const code = await run(argv);
  const out = log.mock.calls.map((call) => String(call[0])).join("\n");
  const err = error.mock.calls.map((call) => String(call[0])).join("\n");
  log.mockRestore();
  error.mockRestore();
  return { code, out, err };
}

async function integrateWave(wave: number, tickets: string, file = `w${wave}.txt`): Promise<void> {
  git(repo, "checkout", "-q", "-b", waveBranchName("7", wave), specBranchName("7"));
  commitFile(file, `${wave}\n`);
  git(repo, "checkout", "-q", "main");
  const result = await runCapturing([
    "integrate",
    "--spec",
    "7",
    "--wave",
    String(wave),
    "--tickets",
    tickets,
  ]);
  expect(result.code).toBe(0);
}

function writeConfig(landing: Record<string, unknown>, trackerKind?: string): void {
  writeFileSync(
    path.join(repo, "emet.config.json"),
    JSON.stringify({
      version: 1,
      landing: { pushSpecBranch: false, ...landing },
      ...(trackerKind === undefined ? {} : { tracker: { kind: trackerKind } }),
    }),
  );
  git(repo, "add", "emet.config.json");
  git(repo, "commit", "-q", "-m", "config");
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-")));
  stateRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-state-")));
  originalCwd = process.cwd();
  originalStateDir = process.env.EMET_STATE_DIR;
  originalPath = process.env.PATH;
  process.env.EMET_STATE_DIR = stateRoot;
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "commit.gpgsign", "false");
  commitFile("README.md", "hi\n");
  process.chdir(repo);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalStateDir === undefined) delete process.env.EMET_STATE_DIR;
  else process.env.EMET_STATE_DIR = originalStateDir;
  process.env.PATH = originalPath;
  rmSync(repo, { recursive: true, force: true });
  rmSync(stateRoot, { recursive: true, force: true });
});

describe("sync", () => {
  test("merges an advanced trunk with one merge commit and rewrites no commit", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    const before = git(repo, "rev-parse", "spec/7");
    commitFile("trunk.txt", "trunk\n");
    const result = await runCapturing(["sync", "--spec", "7"]);
    expect(result.code).toBe(0);
    const tip = git(repo, "rev-parse", "spec/7");
    expect(git(repo, "rev-parse", `${tip}^1`)).toBe(before);
    expect(git(repo, "rev-parse", `${tip}^2`)).toBe(git(repo, "rev-parse", "main"));
  });

  test("fast-forwards the checked-out worktree to the new merge commit", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    commitFile("trunk.txt", "trunk\n");
    git(repo, "checkout", "-q", "spec/7");
    const result = await runCapturing(["sync", "--spec", "7"]);
    expect(result.code).toBe(0);
    expect(git(repo, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "spec/7"));
    expect(git(repo, "status", "--porcelain", "--untracked-files=no")).toBe("");
    expect(git(repo, "ls-files", "trunk.txt")).toBe("trunk.txt");
  });

  test("is a no-op when trunk is already contained", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    const before = git(repo, "rev-parse", "spec/7");
    expect((await runCapturing(["sync", "--spec", "7"])).code).toBe(0);
    expect(git(repo, "rev-parse", "spec/7")).toBe(before);
  });

  test("stops on a conflict, lists the paths and leaves the branch unchanged", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a", "README.md");
    const before = git(repo, "rev-parse", "spec/7");
    commitFile("README.md", "trunk change\n");
    const result = await runCapturing(["sync", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("README.md");
    expect(git(repo, "rev-parse", "spec/7")).toBe(before);
  });
});

describe("land refusals", () => {
  test("sync on a missing branch is refused", async () => {
    writeConfig({ mode: "merge" });
    const result = await runCapturing(["sync", "--spec", "9"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("does not exist");
  });

  test("land refuses when the main worktree is not on trunk", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    git(repo, "checkout", "-q", "-b", "other");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("not main");
  });

  test("sync refuses when the spec branch is checked out in another worktree", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    commitFile("trunk.txt", "trunk\n");
    const other = path.join(realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-other-"))), "wt");
    try {
      git(repo, "worktree", "add", "-q", other, "spec/7");
      const result = await runCapturing(["sync", "--spec", "7"]);
      expect(result.code).not.toBe(0);
      expect(result.err).toContain("is checked out in");
    } finally {
      git(repo, "worktree", "remove", "--force", other);
      rmSync(path.dirname(other), { recursive: true, force: true });
    }
  });

  test("sync refuses when the checked-out spec branch has uncommitted changes", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    commitFile("trunk.txt", "trunk\n");
    git(repo, "checkout", "-q", "spec/7");
    writeFileSync(path.join(repo, "README.md"), "changed\n");
    const result = await runCapturing(["sync", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("not clean");
  });

  test("land refuses on a detached HEAD", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    git(repo, "checkout", "-q", "--detach");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("detached HEAD");
  });

  test("a failing merge is aborted and leaves trunk where it was", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    const hook = path.join(repo, ".git", "hooks", "pre-merge-commit");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    const before = git(repo, "rev-parse", "main");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("failed");
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });

  test("land refuses when the main worktree is dirty", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    commitFile("dirty.txt", "one\n");
    writeFileSync(path.join(repo, "dirty.txt"), "two\n");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("not clean");
  });

  test("pr mode refuses when the push fails", async () => {
    writeConfig({ mode: "pr" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("pushing spec/7 failed");
  });
});

describe("land in merge mode", () => {
  test("adds one merge commit to trunk, never pushes and journals spec.land", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a,b");
    await integrateWave(2, "c");
    const before = git(repo, "rev-parse", "main");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).toBe(0);
    expect(git(repo, "rev-list", "--count", "--first-parent", `${before}..main`)).toBe("1");
    expect(git(repo, "rev-parse", "main^2")).toBe(git(repo, "rev-parse", "spec/7"));
    expect(git(repo, "remote")).toBe("");
    expect(readJournalSegments().events.some((event) => event.kind === "spec.land")).toBe(true);
  });

  test("refuses when no wave is integrated", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("no integrated wave");
  });

  test("refuses on a sync conflict without touching trunk", async () => {
    writeConfig({ mode: "merge" });
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a", "README.md");
    commitFile("README.md", "trunk change\n");
    const before = git(repo, "rev-parse", "main");
    const result = await runCapturing(["land", "--spec", "7"]);
    expect(result.code).not.toBe(0);
    expect(git(repo, "rev-parse", "main")).toBe(before);
  });
});

const PASSING_ROLLUP =
  '{"statusCheckRollup":[{"name":"ci","status":"COMPLETED","conclusion":"SUCCESS"}]}';
const FAILING_ROLLUP =
  '{"statusCheckRollup":[{"name":"ci","status":"COMPLETED","conclusion":"FAILURE"}]}';

async function landWithStub(
  trackerKind: string,
  existingUrl: string,
  checksExit = 0,
  listExit = 0,
  specMergeMethod?: string,
): Promise<{ calls: string; code: number; err: string }> {
  const remote = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-remote-")));
  const binDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-bin-")));
  try {
    git(remote, "init", "-q", "--bare", "-b", "main");
    writeConfig(
      {
        mode: "pr",
        pushSpecBranch: true,
        ...(specMergeMethod === undefined ? {} : { specMergeMethod }),
      },
      trackerKind,
    );
    git(repo, "remote", "add", "origin", remote);
    git(repo, "push", "-q", "origin", "main");
    git(repo, "fetch", "-q", "origin");
    const callsFile = path.join(binDirectory, "calls.log");
    const stub = path.join(binDirectory, "gh");
    writeFileSync(
      stub,
      `#!/bin/sh\nprintf '%s\\n---\\n' "$*" >> "${callsFile}"\nif [ "$1 $2" = "pr list" ]; then echo '${existingUrl}'; exit ${listExit}; fi\nif [ "$1 $2" = "pr create" ]; then echo https://github.com/o/r/pull/9; fi\nif [ "$1 $2" = "pr view" ]; then echo '${checksExit === 0 ? PASSING_ROLLUP : FAILING_ROLLUP}'; fi\n`,
    );
    chmodSync(stub, 0o755);
    process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "feat-01");
    const result = await runCapturing(["land", "--spec", "7"]);
    return { calls: readFileSync(callsFile, "utf8"), code: result.code, err: result.err };
  } finally {
    rmSync(remote, { recursive: true, force: true });
    rmSync(binDirectory, { recursive: true, force: true });
  }
}

describe("land in pr mode edge cases", () => {
  test("a local tracker writes no Closes line", async () => {
    const { calls, code } = await landWithStub("local", "");
    expect(code).toBe(0);
    expect(calls).not.toContain("Closes");
  });

  test("a linear tracker writes the raw ticket id", async () => {
    const { calls, code } = await landWithStub("linear", "");
    expect(code).toBe(0);
    expect(calls).toContain("Closes feat-01");
  });

  test("a failing gh call is reported and stops the landing", async () => {
    const { code, err } = await landWithStub("github", "", 0, 1);
    expect(code).not.toBe(0);
    expect(err).toContain("gh pr list failed");
  });

  test("failing checks stop before the merge and leave the PR open", async () => {
    const { calls, code } = await landWithStub("github", "", 1);
    expect(code).not.toBe(0);
    expect(calls).toContain("pr view");
    expect(calls).not.toContain("pr merge");
  });

  test("specMergeMethod squash merges the PR with --squash", async () => {
    const { calls, code } = await landWithStub("github", "", 0, 0, "squash");
    expect(code).toBe(0);
    expect(calls).toContain("pr merge https://github.com/o/r/pull/9 --squash");
    expect(calls).not.toContain("--merge");
  });

  test("a rerun reuses the open PR instead of creating a second one", async () => {
    const { calls, code } = await landWithStub("github", "https://github.com/o/r/pull/5");
    expect(code).toBe(0);
    expect(calls).not.toContain("pr create");
    expect(calls).toContain("pr merge https://github.com/o/r/pull/5 --merge");
  });
});

describe("land in pr mode", () => {
  test("pushes, opens one PR with a Closes line per ticket and merges with a merge commit", async () => {
    const remote = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-remote-")));
    const binDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-speclanding-bin-")));
    try {
      git(remote, "init", "-q", "--bare", "-b", "main");
      writeConfig({ mode: "pr", pushSpecBranch: true });
      git(repo, "remote", "add", "origin", remote);
      git(repo, "push", "-q", "origin", "main");
      git(repo, "fetch", "-q", "origin");
      const callsFile = path.join(binDirectory, "calls.log");
      const stub = path.join(binDirectory, "gh");
      writeFileSync(
        stub,
        `#!/bin/sh\nprintf '%s\\n---\\n' "$*" >> "${callsFile}"\nif [ "$1 $2" = "pr create" ]; then echo https://github.com/o/r/pull/9; fi\nif [ "$1 $2" = "pr view" ]; then echo '${PASSING_ROLLUP}'; fi\n`,
      );
      chmodSync(stub, 0o755);
      process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
      await runCapturing(["ensure", "--spec", "7"]);
      await integrateWave(1, "101,102");
      await integrateWave(2, "103");
      const result = await runCapturing(["land", "--spec", "7"]);
      expect(result.code).toBe(0);
      const calls = readFileSync(callsFile, "utf8");
      expect(calls.match(/pr create/g)?.length).toBe(1);
      for (const number of ["101", "102", "103"]) expect(calls).toContain(`Closes #${number}`);
      expect(calls).toContain("pr merge https://github.com/o/r/pull/9 --merge");
      expect(git(remote, "rev-parse", "spec/7")).toBe(git(repo, "rev-parse", "spec/7"));
    } finally {
      rmSync(remote, { recursive: true, force: true });
      rmSync(binDirectory, { recursive: true, force: true });
    }
  });
});

describe("waitForSpecChecks", () => {
  const EMPTY_ROLLUP = '{"statusCheckRollup":[]}';

  function fakeDeps(responses: string[]): { deps: WaitForChecksDeps; sleeps: number[] } {
    const sleeps: number[] = [];
    let clock = 0;
    let index = 0;
    const deps: WaitForChecksDeps = {
      gh: () => {
        const response = responses[Math.min(index, responses.length - 1)] ?? EMPTY_ROLLUP;
        index += 1;
        return Promise.resolve(response);
      },
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    };
    return { deps, sleeps };
  }

  const timing = { timeoutMs: 60_000, pollMs: 10 };
  const url = "https://github.com/o/r/pull/9";

  test("keeps polling while no checks are registered, then passes once they are green", async () => {
    const { deps, sleeps } = fakeDeps([EMPTY_ROLLUP, EMPTY_ROLLUP, PASSING_ROLLUP]);
    await waitForSpecChecks(url, deps, timing);
    expect(sleeps.length).toBe(2);
  });

  test("treats a PR that never gets checks as a pass after the grace period", async () => {
    const { deps, sleeps } = fakeDeps([EMPTY_ROLLUP]);
    await waitForSpecChecks(url, deps, timing);
    expect(sleeps.length).toBe(8);
  });

  test("a failing check refuses and names the check", async () => {
    const { deps } = fakeDeps([FAILING_ROLLUP]);
    const outcome = await waitForSpecChecks(url, deps, timing).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(outcome).toMatch(/ended fail: ci/);
  });

  test("a wait that runs out of time refuses", async () => {
    const pending = '{"statusCheckRollup":[{"name":"ci","status":"IN_PROGRESS"}]}';
    const { deps } = fakeDeps([pending]);
    const outcome = await waitForSpecChecks(url, deps, { timeoutMs: 30, pollMs: 10 }).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(outcome).toMatch(/ended timeout/);
  });
});
