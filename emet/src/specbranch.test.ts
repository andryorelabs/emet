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
  test("sync, land and abandon exit 1 with not implemented", async () => {
    await runCapturing(["ensure", "--spec", "7"]);
    const results = [
      await runCapturing(["sync", "--spec", "7"]),
      await runCapturing(["land", "--spec", "7"]),
      await runCapturing(["abandon", "--spec", "7"]),
    ];
    for (const result of results) {
      expect(result.code).toBe(1);
      expect(result.err).toContain("not implemented");
    }
  });

  test("unknown subcommand and missing --spec are usage errors", async () => {
    expect((await runCapturing(["bogus", "--spec", "7"])).code).toBe(2);
    expect((await runCapturing(["status"])).code).toBe(2);
  });
});
