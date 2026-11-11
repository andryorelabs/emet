import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./doctor";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "doctor-run-")));
});

afterEach(() => {
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

function makeRepo(name: string): string {
  const repo = path.join(root, name);
  mkdirSync(repo);
  Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
  return repo;
}

async function runDoctor(argv: string[]): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (line: unknown) => void lines.push(String(line));
  try {
    await run(argv);
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

describe("doctor run()", () => {
  test("a directory that is not a git repository is skipped", async () => {
    const plain = path.join(root, "plain");
    mkdirSync(plain);
    const output = await runDoctor([plain]);
    expect(output).toContain(`${plain}: not a git repository — skipped`);
    expect(output).toContain("0/0 repos clean (1 skipped, not a git repo).");
    expect(output).toContain("Host resources:");
  }, 60_000);

  test("a git repository without a config is reported with the init hint", async () => {
    const repo = makeRepo("bare");
    const output = await runDoctor([repo]);
    expect(output).toContain(`${repo}:`);
    expect(output).toContain('no emet.config.json — run "emet init" here');
    expect(output).toContain("0/1 repos clean (0 skipped, not a git repo).");
    expect(process.exitCode).toBe(1);
  }, 60_000);

  test("a malformed config is reported as malformed", async () => {
    const repo = makeRepo("broken");
    writeFileSync(path.join(repo, "emet.config.json"), "{ not json");
    const output = await runDoctor([repo]);
    expect(output).toContain("emet.config.json is malformed:");
    expect(output).toContain("0/1 repos clean");
  }, 60_000);

  test("--all is ignored and several targets are each reported", async () => {
    const first = makeRepo("one");
    const second = path.join(root, "two");
    mkdirSync(second);
    const output = await runDoctor(["--all", first, second]);
    expect(output).toContain(`${first}:`);
    expect(output).toContain(`${second}: not a git repository — skipped`);
    expect(output).toContain("0/1 repos clean (1 skipped, not a git repo).");
  }, 60_000);
});
