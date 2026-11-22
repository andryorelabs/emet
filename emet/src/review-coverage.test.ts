import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import { run } from "./review";

const finding = (over: Record<string, unknown> = {}) => ({
  id: "F1",
  file: "new.ts",
  line: 3,
  severity: "blocker",
  kind: "patch",
  claim: "bad",
  ...over,
});

describe("review run in process with a base, coverage and merge", () => {
  const originalDirectory = process.cwd();
  const originalExitCode = process.exitCode;
  let repo = "";
  let logs: string[] = [];
  let errors: string[] = [];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  const vcs = (...args: string[]) => {
    const result = Bun.spawnSync(
      ["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { stdout: "pipe", stderr: "pipe" },
    );
    return result.stdout.toString().trim();
  };

  const writeInput = (name: string, content: unknown): string => {
    const file = path.join(repo, name);
    writeFileSync(file, JSON.stringify(content));
    return file;
  };

  const savedLedger = (): Record<string, unknown> => {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8"),
    );
    if (!isObject(parsed)) throw new Error("ledger is not an object");
    return parsed;
  };

  const savedFindings = (): Record<string, unknown>[] => {
    const findings = savedLedger().findings;
    return Array.isArray(findings) ? findings.filter(isObject) : [];
  };

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-cov-")));
    vcs("init", "-q", "-b", "main");
    writeFileSync(path.join(repo, "old.ts"), "a\nb\nc\nd\ne\n");
    vcs("add", ".");
    vcs("commit", "-q", "-m", "init");
    vcs("mv", "old.ts", "new.ts");
    writeFileSync(path.join(repo, "new.ts"), "a\nb\nCHANGED\nd\ne\n");
    vcs("add", ".");
    vcs("commit", "-q", "-m", "wave");
    process.chdir(repo);
    process.exitCode = 0;
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.chdir(originalDirectory);
    process.exitCode = originalExitCode ?? 0;
    rmSync(repo, { recursive: true, force: true });
  });

  test("a finding off the changed lines is marked pre-existing and the base is stored", async () => {
    const file = writeInput("f.json", [
      finding({ id: "on", line: 3 }),
      finding({ id: "off", line: 5 }),
    ]);
    await run(["--ticket", "T-1", "--findings", file, "--base", "HEAD~1"]);
    expect(process.exitCode).toBe(1);
    expect(savedLedger().base).toBe(vcs("rev-parse", "HEAD~1"));
    const marked: Record<string, unknown> = Object.fromEntries(
      savedFindings().map((entry): [string, unknown] => [String(entry.id), entry.preexisting]),
    );
    expect(marked).toEqual({ on: undefined, off: true });
  });

  test("a later round repeating the stored base keeps it", async () => {
    const file = writeInput("f.json", [finding({ severity: "minor" })]);
    await run(["--ticket", "T-1", "--findings", file, "--base", "HEAD~1"]);
    const stored = vcs("rev-parse", "HEAD~1");
    await run(["--ticket", "T-1", "--findings", file, "--base", stored]);
    expect(savedLedger().base).toBe(stored);
  });

  test("a different base on a later round exits 2 naming the stored one", async () => {
    const file = writeInput("f.json", [finding({ severity: "minor" })]);
    await run(["--ticket", "T-1", "--findings", file, "--base", "HEAD~1"]);
    const stored = vcs("rev-parse", "HEAD~1");
    process.exitCode = 0;
    await run(["--ticket", "T-1", "--findings", file, "--base", "HEAD"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain(stored);
  });

  test("an unresolvable base exits 2", async () => {
    const file = writeInput("f.json", [finding()]);
    await run(["--ticket", "T-1", "--findings", file, "--base", "nope"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("does not resolve to a commit");
  });

  test("a coverage verdict proven by a file in the tree exits 0", async () => {
    const file = writeInput("c.json", [
      { s: "S1", verdict: "met", test: { file: "new.ts", name: "CHANGED" } },
    ]);
    await run(["--ticket", "T-1", "--coverage", file, "--expect", "S1"]);
    expect(process.exitCode).toBe(0);
    const printed: unknown = JSON.parse(logs.join("\n"));
    expect(isObject(printed) && printed.coverage).toHaveLength(1);
  });

  test("a coverage verdict whose test name is missing from the file opens VG-S1", async () => {
    const file = writeInput("c.json", [
      { s: "S1", verdict: "met", test: { file: "new.ts", name: "absent" } },
    ]);
    await run(["--ticket", "T-1", "--coverage", file]);
    expect(process.exitCode).toBe(1);
    expect(savedFindings().map((entry) => entry.id)).toEqual(["VG-S1"]);
  });

  test("coverage test files outside the tree, or missing open VG findings", async () => {
    writeFileSync(path.join(path.dirname(repo), "outside.test.ts"), "parses x");
    const file = writeInput("c.json", [
      { s: "S1", verdict: "met", test: { file: "../outside.test.ts", name: "parses x" } },
      { s: "S2", verdict: "met", test: { file: path.join(repo, "new.ts"), name: "CHANGED" } },
      { s: "S3", verdict: "met", test: { file: "missing.ts", name: "x" } },
    ]);
    await run(["--ticket", "T-1", "--coverage", file]);
    rmSync(path.join(path.dirname(repo), "outside.test.ts"), { force: true });
    expect(process.exitCode).toBe(1);
    expect(savedFindings().map((entry) => entry.id)).toEqual(["VG-S1", "VG-S3"]);
  });

  test("a coverage test path that is a directory opens VG-S1", async () => {
    mkdirSync(path.join(repo, "dir"));
    const file = writeInput("c.json", [
      { s: "S1", verdict: "met", test: { file: "dir", name: "x" } },
    ]);
    await run(["--ticket", "T-1", "--coverage", file]);
    expect(process.exitCode).toBe(1);
    expect(savedFindings().map((entry) => entry.id)).toEqual(["VG-S1"]);
  });

  test("a coverage file that is not an array exits 2", async () => {
    const file = writeInput("c.json", { not: "an array" });
    await run(["--ticket", "T-1", "--coverage", file]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("JSON array");
  });

  test("a coverage entry that is not an object or has an empty s exits 2", async () => {
    await run(["--ticket", "T-1", "--coverage", writeInput("c.json", ["x"])]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("must be an object");
    errors = [];
    await run(["--ticket", "T-1", "--coverage", writeInput("c.json", [{ s: "", verdict: "met" }])]);
    expect(errors.join("\n")).toContain("non-empty string");
  });

  test("a findings file with a numeric userOption exits 2", async () => {
    const file = writeInput("f.json", [finding({ userOption: 3 })]);
    await run(["--ticket", "T-1", "--findings", file]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("userOption");
  });

  test("a recheck resolves one finding and leaves the other open", async () => {
    const file = writeInput("f.json", [finding({ id: "A" }), finding({ id: "B", line: 4 })]);
    await run(["--ticket", "T-1", "--findings", file]);
    const verdicts = writeInput("v.json", [
      { id: "A", resolved: true },
      { id: "B", resolved: false },
    ]);
    await run(["--ticket", "T-1", "--recheck", "--verdicts", verdicts]);
    expect(process.exitCode).toBe(1);
    const open = savedFindings().filter((entry) => entry.status === "open");
    expect(open.map((entry) => entry.id)).toEqual(["B"]);
  });

  test("--merge without two files prints usage and exits 2", async () => {
    await run(["--merge", "only.json"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("--merge");
  });
});
