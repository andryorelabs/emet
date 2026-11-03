import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildReviewPackage } from "./reviewpackage";

let repo: string;

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function commitFile(name: string, content: string): string {
  writeFileSync(path.join(repo, name), content);
  git("add", "-A");
  git("commit", "-q", "-m", `add ${name}`);
  return git("rev-parse", "HEAD");
}

let base: string;
let head: string;
let sideBranchHead: string;

beforeAll(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), "forge-review-package-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  base = commitFile("a.txt", "one\n");
  head = commitFile("b.txt", "two\n");
  git("checkout", "-q", "-b", "side", base);
  sideBranchHead = commitFile("c.txt", "three\n");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("buildReviewPackage", () => {
  test("packages commits, stat and diff for a descendant range", async () => {
    const result = await buildReviewPackage(base, head, repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commitCount).toBe(1);
    expect(result.content).toContain("add b.txt");
    expect(result.content).toContain("b.txt | 1 +");
    expect(result.content).toContain("+two");
  });

  test("rejects an empty range", async () => {
    const result = await buildReviewPackage(head, head, repo);
    expect(result).toMatchObject({ ok: false, problem: "empty" });
  });

  test("rejects a head that is not a descendant of base", async () => {
    const result = await buildReviewPackage(head, sideBranchHead, repo);
    expect(result).toMatchObject({ ok: false, problem: "not-descendant" });
  });

  test("rejects an unresolvable ref", async () => {
    const result = await buildReviewPackage("nope", head, repo);
    expect(result).toMatchObject({ ok: false, problem: "unresolvable" });
  });
});

describe("forge review-package CLI", () => {
  const cli = path.join(import.meta.dir, "reviewpackage.ts");
  const runCli = (...args: string[]) => Bun.spawnSync(["bun", cli, ...args], { cwd: repo });

  test("writes the file and exits 0", () => {
    const out = path.join(repo, "pkg.md");
    const result = runCli(base, head, "--out", out);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("## Diff (-U10)");
  });

  test("exits 3 on an empty range", () => {
    expect(runCli(head, head).exitCode).toBe(3);
  });

  test("exits 3 on a non-descendant range", () => {
    expect(runCli(head, sideBranchHead).exitCode).toBe(3);
  });

  test("exits 2 on missing arguments", () => {
    expect(runCli(base).exitCode).toBe(2);
  });
});
