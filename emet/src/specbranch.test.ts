import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { readJournalSegments } from "./journal";
import { isObject } from "./narrow";
import { readSpecBranchState, run, specBranchName, waveBranchName } from "./specbranch";

let repo = "";
let stateRoot = "";
let originalCwd = "";
let originalStateDir: string | undefined;

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

function makeWaveBranch(spec: string, wave: number, file: string): void {
  git(repo, "checkout", "-q", "-b", waveBranchName(spec, wave), specBranchName(spec));
  commitFile(file, `${file}\n`);
  git(repo, "checkout", "-q", "main");
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

interface ParsedState {
  branch: string;
  tip: string;
  behindTrunk: number;
  waves: { wave: number; tickets: string[] }[];
}

function parseState(text: string): ParsedState {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("not an object");
  return { branch: "", tip: "", behindTrunk: 0, waves: [], ...value };
}

async function integrateWave(wave: number, tickets: string): Promise<void> {
  makeWaveBranch("7", wave, `w${wave}.txt`);
  const result = await runCapturing([
    "integrate",
    "--spec",
    "7",
    "--wave",
    String(wave),
    "--branch",
    waveBranchName("7", wave),
    "--tickets",
    tickets,
  ]);
  expect(result.code).toBe(0);
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-specbranch-")));
  stateRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-specbranch-state-")));
  originalCwd = process.cwd();
  originalStateDir = process.env.EMET_STATE_DIR;
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
  rmSync(repo, { recursive: true, force: true });
  rmSync(stateRoot, { recursive: true, force: true });
});

describe("branch names", () => {
  test("derive from the spec id", () => {
    expect(specBranchName("7")).toBe("spec/7");
    expect(waveBranchName("7", 2)).toBe("spec/7-w2");
  });
});

describe("ensure", () => {
  test("creates spec/<id> from trunk, writes branch.json and is idempotent", async () => {
    const first = await runCapturing(["ensure", "--spec", "7"]);
    expect(first.code).toBe(0);
    expect(git(repo, "rev-parse", "spec/7")).toBe(git(repo, "rev-parse", "main"));
    const file = path.join(repo, ".emet", "specs", "7", "branch.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ spec: "7", waves: [] });
    expect((await runCapturing(["ensure", "--spec", "7"])).code).toBe(0);
  });

  test("refuses when another spec's branch is checked out, naming it", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    git(repo, "checkout", "-q", "spec/7");
    const result = await runCapturing(["ensure", "--spec", "8"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("spec 7");
    expect(git(repo, "branch", "--list", "spec/8")).toBe("");
  });
});

describe("integrate and status", () => {
  test("two waves make two merge commits with trailers and status lists both", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a,b");
    await integrateWave(2, "c");
    const merges = git(repo, "log", "--merges", "--format=%H", "main..spec/7").split("\n");
    expect(merges).toHaveLength(2);
    const trailers = git(
      repo,
      "log",
      "-1",
      "--format=%(trailers:key=Emet-Tickets,valueonly)",
      "spec/7",
    );
    expect(trailers).toBe("c");
    const status = await runCapturing(["status", "--spec", "7"]);
    const parsed = parseState(status.out);
    expect(parsed.branch).toBe("spec/7");
    expect(parsed.tip).toBe(git(repo, "rev-parse", "spec/7"));
    expect(parsed.behindTrunk).toBe(0);
    expect(parsed.waves.map((entry) => [entry.wave, entry.tickets])).toEqual([
      [1, ["a", "b"]],
      [2, ["c"]],
    ]);
    const events = readJournalSegments({ directory: path.join(stateRoot, "journal") }).events;
    expect(events.filter((entry) => entry.kind === "spec.integrate")).toHaveLength(2);
  });

  test("status rebuilds branch.json from trailers after a crash", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a,b");
    const file = path.join(repo, ".emet", "specs", "7", "branch.json");
    rmSync(file);
    const state = await readSpecBranchState(repo, "7");
    expect(state?.waves.map((entry) => entry.wave)).toEqual([1]);
    expect(existsSync(file)).toBe(true);
    expect(parseState(readFileSync(file, "utf8")).waves[0]?.tickets).toEqual(["a", "b"]);
  });

  test("a conflicting wave is refused and leaves spec/<id> untouched", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    await integrateWave(1, "a");
    git(repo, "checkout", "-q", "-b", "spec/7-w2", "main");
    commitFile("w1.txt", "different\n");
    const before = git(repo, "rev-parse", "spec/7");
    const result = await runCapturing([
      "integrate",
      "--spec",
      "7",
      "--wave",
      "2",
      "--tickets",
      "b",
    ]);
    expect(result.code).toBe(1);
    expect(git(repo, "rev-parse", "spec/7")).toBe(before);
  });

  test("status on a missing branch exits 1", async () => {
    expect((await runCapturing(["status", "--spec", "9"])).code).toBe(1);
  });
});

describe("dispatcher", () => {
  test("abandon without --force is refused and keeps the branch", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    const result = await runCapturing(["abandon", "--spec", "7"]);
    expect(result.code).toBe(1);
    expect(result.err).not.toContain("not implemented");
    expect(git(repo, "rev-parse", "--verify", "spec/7")).not.toBe("");
  });

  test("sync and land are routed to their implementations", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    const sync = await runCapturing(["sync", "--spec", "7"]);
    const land = await runCapturing(["land", "--spec", "7"]);
    expect(sync.err).not.toContain("not implemented");
    expect(land.err).not.toContain("not implemented");
  });

  test("unknown subcommand and missing --spec are usage errors", async () => {
    expect((await runCapturing(["bogus", "--spec", "7"])).code).toBe(2);
    expect((await runCapturing(["status"])).code).toBe(2);
  });
});

function writeConfig(remote: string, mode: "pr" | "merge"): void {
  writeFileSync(
    path.join(repo, "emet.config.json"),
    JSON.stringify({
      version: 1,
      repo: { trunk: "main", remote },
      ticket: { idPattern: "^X-\\d+$", branchPrefix: "x" },
      landing: { mode },
    }),
  );
}

function makeBareRemote(name: string): string {
  const bare = realpathSync(mkdtempSync(path.join(os.tmpdir(), `emet-specbranch-${name}-`)));
  git(bare, "init", "-q", "--bare", "-b", "main");
  return bare;
}

describe("remote and checkout handling", () => {
  test("pr mode forks spec/<id> from the remote trunk, not a stale local one", async () => {
    const bare = makeBareRemote("trunk");
    try {
      writeConfig("origin", "pr");
      git(repo, "remote", "add", "origin", bare);
      git(repo, "push", "-q", "origin", "main");
      commitFile("ahead.txt", "ahead\n");
      git(repo, "push", "-q", "origin", "main");
      git(repo, "update-ref", "refs/heads/main", "HEAD~1");
      git(repo, "fetch", "-q", "origin");
      const result = await runCapturing(["ensure", "--spec", "7"]);
      expect(result.code).toBe(0);
      expect(git(repo, "rev-parse", "spec/7")).toBe(git(repo, "rev-parse", "origin/main"));
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("integrate pushes to the configured remote, not origin", async () => {
    const bare = makeBareRemote("upstream");
    try {
      writeConfig("upstream", "merge");
      git(repo, "remote", "add", "upstream", bare);
      await runCapturing(["ensure", "--spec", "7"]);
      await integrateWave(1, "X-1");
      expect(git(bare, "rev-parse", "spec/7")).toBe(git(repo, "rev-parse", "spec/7"));
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("a retry after a failed push pushes instead of reporting success", async () => {
    const bare = makeBareRemote("retry");
    const missing = path.join(os.tmpdir(), "emet-specbranch-missing-remote");
    try {
      writeConfig("origin", "merge");
      git(repo, "remote", "add", "origin", missing);
      await runCapturing(["ensure", "--spec", "7"]);
      makeWaveBranch("7", 1, "w1.txt");
      const args = ["integrate", "--spec", "7", "--wave", "1", "--tickets", "X-1"];
      expect((await runCapturing(args)).code).toBe(1);
      git(repo, "remote", "set-url", "origin", bare);
      expect((await runCapturing(args)).code).toBe(0);
      expect(git(bare, "rev-parse", "spec/7")).toBe(git(repo, "rev-parse", "spec/7"));
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("a spec branch checked out in a linked worktree is refused", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    makeWaveBranch("7", 1, "w1.txt");
    const linked = path.join(os.tmpdir(), `emet-specbranch-linked-${process.pid}`);
    git(repo, "worktree", "add", "-q", linked, "spec/7");
    try {
      const before = git(repo, "rev-parse", "spec/7");
      const integrate = await runCapturing([
        "integrate",
        "--spec",
        "7",
        "--wave",
        "1",
        "--tickets",
        "X-1",
      ]);
      expect(integrate.code).not.toBe(0);
      expect(integrate.err).toContain("checked out");
      expect(git(repo, "rev-parse", "spec/7")).toBe(before);
      const ensure = await runCapturing(["ensure", "--spec", "8"]);
      expect(ensure.code).not.toBe(0);
      expect(ensure.err).toContain("spec 7");
    } finally {
      git(repo, "worktree", "remove", "--force", linked);
    }
  });
});

describe("refusals and usage errors", () => {
  test("integrate without a spec branch says to run ensure", async () => {
    const result = await runCapturing([
      "integrate",
      "--spec",
      "7",
      "--wave",
      "1",
      "--tickets",
      "a",
    ]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("ensure");
  });

  test("integrate refuses a missing wave branch and an already merged one", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    const missing = await runCapturing([
      "integrate",
      "--spec",
      "7",
      "--wave",
      "1",
      "--tickets",
      "a",
    ]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("does not exist");
    git(repo, "branch", waveBranchName("7", 1), specBranchName("7"));
    const merged = await runCapturing([
      "integrate",
      "--spec",
      "7",
      "--wave",
      "1",
      "--tickets",
      "a",
    ]);
    expect(merged.code).toBe(1);
    expect(merged.err).toContain("already merged");
  });

  test("integrate refuses a dirty checked out spec branch", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    makeWaveBranch("7", 1, "w1.txt");
    git(repo, "checkout", "-q", "spec/7");
    writeFileSync(path.join(repo, "README.md"), "dirty\n");
    const result = await runCapturing([
      "integrate",
      "--spec",
      "7",
      "--wave",
      "1",
      "--tickets",
      "a",
    ]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("not clean");
  });

  test("ensure on an invalid branch name and on a missing trunk are refused", async () => {
    expect((await runCapturing(["ensure", "--spec", "bad name"])).code).toBe(1);
    git(repo, "branch", "-m", "main", "renamed");
    const noTrunk = await runCapturing(["ensure", "--spec", "7"]);
    expect(noTrunk.code).toBe(1);
  });

  test("bad flags are usage errors and --help prints the usage", async () => {
    expect((await runCapturing(["integrate", "--spec"])).code).toBe(2);
    expect(
      (await runCapturing(["integrate", "--spec", "7", "--wave", "x", "--tickets", "a"])).code,
    ).toBe(2);
    expect(
      (await runCapturing(["integrate", "--spec", "7", "--wave", "1", "--tickets", ","])).code,
    ).toBe(2);
    const help = await runCapturing(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("usage: emet spec-branch");
  });
});
