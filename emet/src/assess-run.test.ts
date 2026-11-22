import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./assess";
import { currentExitCode } from "./exit-code";

let repo: string;
let previousDirectory: string;

async function commitFile(name: string, content: string): Promise<void> {
  await Bun.write(path.join(repo, name), content);
  await Bun.$`git -C ${repo} add -A`.quiet();
  await Bun.$`git -C ${repo} commit -q -m change`.quiet();
}

beforeEach(async () => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "assess-run-")));
  await Bun.$`git init -q -b main ${repo}`.quiet();
  await Bun.$`git -C ${repo} config user.email t@t.t`.quiet();
  await Bun.$`git -C ${repo} config user.name t`.quiet();
  await commitFile("README.md", "hi\n");
  previousDirectory = process.cwd();
  process.chdir(repo);
});

afterEach(() => {
  process.chdir(previousDirectory);
  process.exitCode = 0;
  rmSync(repo, { recursive: true, force: true });
});

async function runAssess(
  argv: string[],
): Promise<{ logs: string[]; errors: string[]; code: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line: string) => void logs.push(line);
  console.error = (line: unknown) => void errors.push(String(line));
  process.exitCode = 0;
  try {
    await run(argv);
    return { logs, errors, code: currentExitCode() };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = 0;
  }
}

describe("assess run()", () => {
  test("missing --base or --head prints usage and exits 2", async () => {
    const result = await runAssess(["--base", "HEAD"]);
    expect(result.code).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.logs).toEqual([]);
  });

  test("a flag value that is another flag counts as missing", async () => {
    const result = await runAssess(["--base", "--head", "HEAD"]);
    expect(result.code).toBe(2);
  });

  test("a docs-only diff classifies as passive", async () => {
    await commitFile("README.md", "changed\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ tier: "passive", reviewer: null });
  });

  test("a source diff classifies as medium and --risk-line raises it to high", async () => {
    await commitFile("src/app.ts", "export const a = 1\n");
    const plain = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(JSON.parse(plain.logs[0] ?? "")).toMatchObject({ tier: "medium" });
    const raised = await runAssess([
      "--base",
      "HEAD~1",
      "--head",
      "HEAD",
      "--risk-line",
      "Risk: item 1 (shared caller)",
    ]);
    expect(JSON.parse(raised.logs[0] ?? "")).toMatchObject({ tier: "high" });
  });

  test("Risk: none leaves the tier unchanged", async () => {
    await commitFile("src/app.ts", "export const a = 1\n");
    const result = await runAssess([
      "--base",
      "HEAD~1",
      "--head",
      "HEAD",
      "--risk-line",
      "Risk: none",
    ]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ tier: "medium" });
  });

  test("an unknown ref reports the git failure and exits 2", async () => {
    const result = await runAssess(["--base", "no-such-ref", "--head", "HEAD"]);
    expect(result.code).toBe(2);
    expect(result.errors[0]).toContain("emet assess: git diff failed");
  });

  test("outside a git repository it exits 2", async () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "assess-outside-")));
    process.chdir(outside);
    try {
      const result = await runAssess(["--base", "a", "--head", "b"]);
      expect(result.code).toBe(2);
      expect(result.errors[0]).toContain("not inside a git repository");
    } finally {
      process.chdir(repo);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("prints browserVerify with run false when verify.browser is absent", async () => {
    await commitFile("src/app.ts", "export const a = 1\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      browserVerify: { run: false, reason: "verify.browser is not configured" },
    });
  });

  test("--quick on a docs-only diff reports quickRejected false and exits 0", async () => {
    await commitFile("README.md", "changed\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD", "--quick"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      tier: "passive",
      quickRejected: false,
    });
  });

  test("--quick on a workflow diff reports quickRejected true and exits 1", async () => {
    await commitFile(".github/workflows/ci.yml", "name: ci\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD", "--quick"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ tier: "high", quickRejected: true });
  });

  test("without --quick the output has no quickRejected field", async () => {
    await commitFile(".github/workflows/ci.yml", "name: ci\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.logs[0] ?? "")).not.toHaveProperty("quickRejected");
  });

  test("prints dualReview and finds codex on PATH", async () => {
    await commitFile(".github/workflows/ci.yml", "name: ci\n");
    const binDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "assess-bin-")));
    const codexPath = path.join(binDirectory, "codex");
    await Bun.write(codexPath, "#!/bin/sh\n");
    await Bun.$`chmod +x ${codexPath}`.quiet();
    const previousPath = process.env.PATH;
    process.env.PATH = `${binDirectory}:${previousPath ?? ""}`;
    try {
      const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
      expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
        tier: "high",
        dualReview: { run: true },
      });
    } finally {
      process.env.PATH = previousPath;
      rmSync(binDirectory, { recursive: true, force: true });
    }
  });

  test("dualReview is false for a medium tier", async () => {
    await commitFile("src/app.ts", "export const a = 1\n");
    const result = await runAssess(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      dualReview: { run: false, reason: expect.stringContaining("tier") as unknown },
    });
  });
});
