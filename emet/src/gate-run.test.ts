import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./gate";

interface Captured {
  logs: string[];
  errors: string[];
  exitCode: number | string | null | undefined;
}

let root: string;
let runDirectory: string;
let previousDirectory: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "gate-run-")));
  runDirectory = path.join(root, ".emet", "runs", "r1");
  mkdirSync(path.join(runDirectory, "verify"), { recursive: true });
  previousDirectory = process.cwd();
  process.chdir(root);
});

afterEach(() => {
  process.chdir(previousDirectory);
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

async function runGate(argv: string[]): Promise<Captured> {
  const captured: Captured = { logs: [], errors: [], exitCode: undefined };
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line: string) => void captured.logs.push(line);
  console.error = (line: string) => void captured.errors.push(line);
  process.exitCode = 0;
  try {
    await run(argv);
    captured.exitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = 0;
  }
  return captured;
}

describe("gate run()", () => {
  test("a missing ticket prints usage and exits 2", async () => {
    const result = await runGate([]);
    expect(result.exitCode).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.logs).toEqual([]);
  });

  test("a flag in place of the ticket exits 2", async () => {
    const result = await runGate(["--run", "r1"]);
    expect(result.exitCode).toBe(2);
  });

  test("an unknown tier is rejected", async () => {
    const result = await runGate(["CLA-1", "--run", "r1", "--tier", "extreme"]);
    expect(result.exitCode).toBe(2);
    expect(result.errors[0]).toContain("--tier must be passive|medium|high");
  });

  test("an invalid ci state is rejected", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "maybe"]);
    expect(result.exitCode).toBe(2);
    expect(result.errors[0]).toContain("--ci must be pass|fail|pending|none");
  });

  test("a run that cannot be inferred asks for --run", async () => {
    const result = await runGate(["CLA-1"]);
    expect(result.exitCode).toBe(2);
    expect(result.errors[0]).toContain("cannot infer run for CLA-1");
  });

  test("a single dispatched run is inferred from the dispatch record", async () => {
    writeJson(path.join(runDirectory, "dispatch", "CLA-1.json"), {});
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const result = await runGate(["CLA-1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "merge" });
  });

  test("an unsafe run id is rejected", async () => {
    const result = await runGate(["CLA-1", "--run", "../evil"]);
    expect(result.exitCode).toBe(2);
    expect(result.errors[0]).toContain("invalid run or ticket id");
  });

  test("green verify and ci merge", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "merge", chargeAttempt: false });
  });

  test("an open blocker in the review ledger holds the ticket", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), {
      rounds: 0,
      findings: [
        { status: "open", severity: "blocker" },
        { status: "closed", severity: "blocker" },
        { status: "open", severity: "bogus" },
        "not an object",
      ],
    });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({
      decision: "hold",
      reasons: [expect.stringContaining("1 open")],
    });
  });

  test("a ledger without a findings array counts as no findings", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), { rounds: "x" });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "merge" });
  });

  test("an env output file with an outage pattern holds without charging", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    const envOutput = path.join(root, "env.txt");
    writeFileSync(envOutput, "API Error: 529 overloaded_error");
    const result = await runGate([
      "CLA-1",
      "--run",
      "r1",
      "--env-exit",
      "1",
      "--env-output",
      envOutput,
    ]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "hold", chargeAttempt: false });
    expect(existsSync(path.join(runDirectory, "attempts", "CLA-1.json"))).toBe(false);
  });

  test("a stored attempt count is read back and exhausts the budget", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    writeJson(path.join(runDirectory, "attempts", "CLA-1.json"), { count: 99 });
    const result = await runGate(["CLA-1", "--run", "r1"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "defer" });
  });

  test("a stored attempt record without a count is treated as zero", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    writeJson(path.join(runDirectory, "attempts", "CLA-1.json"), { other: true });
    const result = await runGate(["CLA-1", "--run", "r1"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ decision: "hold", chargeAttempt: true });
  });

  test("--no-record leaves the attempt counter untouched", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    const result = await runGate(["CLA-1", "--run", "r1", "--no-record"]);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({ chargeAttempt: true });
    expect(existsSync(path.join(runDirectory, "attempts", "CLA-1.json"))).toBe(false);
  });

  test("a charged attempt is persisted with the incremented count", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    await runGate(["CLA-1", "--run", "r1", "--attempts", "0"]);
    expect(
      JSON.parse(readFileSync(path.join(runDirectory, "attempts", "CLA-1.json"), "utf8")),
    ).toEqual({ count: 1 });
  });
});
