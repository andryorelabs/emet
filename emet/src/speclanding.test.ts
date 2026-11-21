import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readJournalSegments } from "./journal";
import { run, specBranchName, waveBranchName } from "./specbranch";

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

function writeConfig(landing: Record<string, unknown>): void {
  writeFileSync(
    path.join(repo, "emet.config.json"),
    JSON.stringify({ version: 1, landing: { pushSpecBranch: false, ...landing } }),
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
        `#!/bin/sh\nprintf '%s\\n---\\n' "$*" >> "${callsFile}"\nif [ "$1 $2" = "pr create" ]; then echo https://github.com/o/r/pull/9; fi\n`,
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
