import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./reviewpackage";

let repo: string;
let base: string;
let head: string;
let side: string;
const originalCwd = process.cwd();

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function commitFile(name: string): string {
  writeFileSync(path.join(repo, name), `${name}\n`);
  git("add", "-A");
  git("commit", "-q", "-m", `add ${name}`);
  return git("rev-parse", "HEAD");
}

beforeAll(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), "emet-rp-run-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  base = commitFile("a.txt");
  head = commitFile("b.txt");
  git("checkout", "-q", "-b", "side", base);
  side = commitFile("c.txt");
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(repo, { recursive: true, force: true });
  process.exitCode = 0;
});

async function invoke(argv: string[]): Promise<{ out: string[]; err: string[]; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation(
    (...args) => void out.push(args.join(" ")),
  );
  const errorSpy = spyOn(console, "error").mockImplementation(
    (...args) => void err.push(args.join(" ")),
  );
  process.exitCode = 0;
  process.chdir(repo);
  try {
    await run(argv);
    return { out, err, code: process.exitCode ?? 0 };
  } finally {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

describe("review-package run", () => {
  test("exits 2 with usage when arguments are missing", async () => {
    const result = await invoke([base]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage:");
  });

  test("exits 2 when --out has no value", async () => {
    const result = await invoke([base, head, "--out"]);
    expect(result.code).toBe(2);
  });

  test("writes the package to --out and prints the path", async () => {
    const target = path.join(repo, "out", "pkg.md");
    const result = await invoke([base, head, "--out", target]);
    expect(result.code).toBe(0);
    expect(result.out).toEqual([target]);
    const content = readFileSync(target, "utf8");
    expect(content).toContain("## Commits");
    expect(content).toContain("b.txt");
  });

  test("defaults the output under the run directory, named by head", async () => {
    const result = await invoke([base, head]);
    expect(result.code).toBe(0);
    expect(path.basename(result.out[0]!)).toBe(`review-package-${head}.md`);
    expect(readFileSync(result.out[0]!, "utf8")).toContain("# Review package");
  });

  test("a non-descendant range exits 3 with the problem on stderr", async () => {
    const bad = await invoke([head, side, "--out", path.join(repo, "y.md")]);
    expect(bad.code).toBe(3);
    expect(bad.err.join("\n")).toContain("emet review-package:");
  });
});
