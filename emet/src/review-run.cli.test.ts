import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./review";

let repo: string;
const originalCwd = process.cwd();

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-cli-")));
  const init = Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: repo });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString());
});

afterEach(() => {
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

function writeFindings(items: unknown[]): string {
  const file = path.join(repo, "findings.json");
  writeFileSync(file, JSON.stringify(items));
  return file;
}

const blocker = {
  id: "F1",
  file: "a.ts",
  line: 3,
  severity: "blocker",
  kind: "patch",
  claim: "bad",
};

describe("review run in-process", () => {
  test("exits 2 with usage when --ticket is missing", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage");
  });

  test("rejects an invalid ticket id with exit 2", async () => {
    const result = await invoke(["--ticket", "bad id!"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('invalid ticket id "bad id!"');
  });

  test("exits 2 with usage when no action flag follows the ticket", async () => {
    const result = await invoke(["--ticket", "T-1"]);
    expect(result.code).toBe(2);
  });

  test("--rulings on an empty ledger prints the formatted rulings", async () => {
    const result = await invoke(["--ticket", "T-1", "--rulings"]);
    expect(result.code).toBe(0);
    expect(result.out).toHaveLength(1);
  });

  test("--escalate without --model exits 2", async () => {
    const result = await invoke(["--ticket", "T-1", "--escalate"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("--escalate needs --model");
  });

  test("--escalate maps the default sonnet tier to opus", async () => {
    const result = await invoke(["--ticket", "T-1", "--escalate", "--model", "sonnet"]);
    expect(result.code).toBe(0);
    expect(result.out).toEqual(["opus"]);
  });

  test("--escalate with no higher tier exits 1", async () => {
    const result = await invoke(["--ticket", "T-1", "--escalate", "--model", "opus"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain('no escalation tier above "opus"');
  });

  test("--rule without --why and --cost exits 2", async () => {
    const result = await invoke(["--ticket", "T-1", "--rule", "keep it"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("--rule needs --why and --cost");
  });

  test("--rule persists a ruling that --rulings later lists", async () => {
    const ruled = await invoke([
      "--ticket",
      "T-1",
      "--rule",
      "keep wrapper",
      "--why",
      "callers depend on it",
      "--cost",
      "one extra hop",
    ]);
    expect(ruled.code).toBe(0);
    const listed = await invoke(["--ticket", "T-1", "--rulings"]);
    expect(listed.out.join("\n")).toContain("keep wrapper");
    expect(listed.out.join("\n")).toContain("callers depend on it");
  });

  test("a findings round with an open blocker prints it and exits 1", async () => {
    const result = await invoke(["--ticket", "T-1", "--findings", writeFindings([blocker])]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({ round: 1, open: [{ id: "F1" }] });
    const ledger: unknown = JSON.parse(
      readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8"),
    );
    expect(ledger).toMatchObject({ rounds: 1 });
  });

  test("a clean findings round exits 0 with no open items", async () => {
    const result = await invoke(["--ticket", "T-1", "--findings", writeFindings([])]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out[0]!)).toMatchObject({ open: [] });
  });

  test("malformed findings JSON exits 2", async () => {
    const file = path.join(repo, "bad.json");
    writeFileSync(file, "nope");
    const result = await invoke(["--ticket", "T-1", "--findings", file]);
    expect(result.code).toBe(2);
  });

  test("an unreadable findings file exits 3", async () => {
    const result = await invoke(["--ticket", "T-1", "--findings", path.join(repo, "missing.json")]);
    expect(result.code).toBe(3);
  });
});
