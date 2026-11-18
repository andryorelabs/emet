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
import { appendEvent, readJournalSegments } from "./journal";

interface Captured {
  logs: string[];
  errors: string[];
  exitCode: number | string | null | undefined;
}

let root: string;
let runDirectory: string;
let previousDirectory: string;
let previousStateDir: string | undefined;

beforeEach(() => {
  previousStateDir = process.env.EMET_STATE_DIR;
  process.env.EMET_STATE_DIR = path.join(
    realpathSync(mkdtempSync(path.join(tmpdir(), "gate-state-"))),
    "state",
  );
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "gate-run-")));
  runDirectory = path.join(root, ".emet", "runs", "r1");
  mkdirSync(path.join(runDirectory, "verify"), { recursive: true });
  previousDirectory = process.cwd();
  process.chdir(root);
});

afterEach(() => {
  const stateRoot = path.dirname(process.env.EMET_STATE_DIR ?? "");
  if (previousStateDir === undefined) Reflect.deleteProperty(process.env, "EMET_STATE_DIR");
  else process.env.EMET_STATE_DIR = previousStateDir;
  if (stateRoot.includes("gate-state-")) rmSync(stateRoot, { recursive: true, force: true });
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

describe("gate run() journal", () => {
  test("a printed decision is journaled with an intervention when nothing launched the wave", async () => {
    writeJson(path.join(root, ".emet", "runs", "emet700w1111111", "verify", "CLA-1.json"), {
      ok: true,
    });
    const result = await runGate(["CLA-1", "--run", "emet700w1111111", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "merge" });
    const events = readJournalSegments().events;
    expect(events.map((event) => event.kind)).toEqual(["gate.decision", "intervention"]);
    expect(events[0]?.data).toMatchObject({ ticket: "CLA-1", decision: "merge", tier: "medium" });
    expect(events[0]?.runId).toBe("emet700w1111111");
    expect(events[1]?.origin).toBe("human");
  });

  test("no intervention is written once a launch.result exists for the spec", async () => {
    appendEvent({
      kind: "launch.result",
      repo: root,
      origin: "auto",
      data: { spec: "700", wave: 1, name: "emet-700-w1", outcome: "started" },
    });
    writeJson(path.join(root, ".emet", "runs", "emet700w1111111", "verify", "CLA-1.json"), {
      ok: true,
    });
    await runGate(["CLA-1", "--run", "emet700w1111111", "--ci", "pass"]);
    const kinds = readJournalSegments().events.map((event) => event.kind);
    expect(kinds).toEqual(["launch.result", "gate.decision"]);
  });

  test("--no-record writes no event", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    await runGate(["CLA-1", "--run", "r1", "--ci", "pass", "--no-record"]);
    expect(readJournalSegments().events).toEqual([]);
  });

  test("an unwritable journal leaves the output and exit code unchanged", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const blocker = path.join(root, "blocker");
    writeFileSync(blocker, "file");
    process.env.EMET_STATE_DIR = blocker;
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "merge" });
  });
});

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
    expect(result.errors[0]).toContain("--ci must be pass|fail|pending|none|env-fault");
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
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "merge" });
  });

  test("an unsafe run id is rejected", async () => {
    const result = await runGate(["CLA-1", "--run", "../evil"]);
    expect(result.exitCode).toBe(2);
    expect(result.errors[0]).toContain("invalid run or ticket id");
  });

  test("green verify and ci merge", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      decision: "merge",
      chargeAttempt: false,
    });
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
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      decision: "hold",
      reasons: [expect.stringContaining("1 open")],
    });
  });

  test("a ledger without a findings array counts as no findings", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), { rounds: "x" });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "merge" });
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
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      decision: "hold",
      chargeAttempt: false,
    });
    expect(existsSync(path.join(runDirectory, "attempts", "CLA-1.json"))).toBe(false);
  });

  test("a stored attempt count is read back and exhausts the budget", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    writeJson(path.join(runDirectory, "attempts", "CLA-1.json"), { count: 99 });
    const result = await runGate(["CLA-1", "--run", "r1"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "defer" });
  });

  test("a stored attempt record without a count is treated as zero", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    writeJson(path.join(runDirectory, "attempts", "CLA-1.json"), { other: true });
    const result = await runGate(["CLA-1", "--run", "r1"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      decision: "hold",
      chargeAttempt: true,
    });
  });

  test("--no-record leaves the attempt counter untouched", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    const result = await runGate(["CLA-1", "--run", "r1", "--no-record"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ chargeAttempt: true });
    expect(existsSync(path.join(runDirectory, "attempts", "CLA-1.json"))).toBe(false);
  });

  test("a charged attempt is persisted with the incremented count", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: false });
    await runGate(["CLA-1", "--run", "r1", "--attempts", "0"]);
    expect(
      JSON.parse(readFileSync(path.join(runDirectory, "attempts", "CLA-1.json"), "utf8")),
    ).toEqual({ count: 1 });
  });

  test("open patch findings hold with next fix-findings by default", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), {
      rounds: 0,
      findings: [
        { status: "open", severity: "blocker", kind: "patch" },
        { status: "open", severity: "critical" },
      ],
    });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({
      decision: "hold",
      next: "fix-findings",
    });
  });

  test("a ledger fixRounds at the cap stops, an unknown kind reads as patch", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), {
      rounds: 0,
      fixRounds: 2,
      findings: [{ status: "open", severity: "blocker", kind: "weird" }],
    });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "stop" });
  });

  test("two env-fault runs escalate, and a pass resets the counter", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const counters = path.join(runDirectory, "checks", "CLA-1.json");
    const first = await runGate(["CLA-1", "--run", "r1", "--ci", "env-fault"]);
    expect(JSON.parse(first.logs[0] ?? "")).toMatchObject({ next: "rerun-ci" });
    expect(JSON.parse(readFileSync(counters, "utf8"))).toMatchObject({ ciEnvFaults: 1 });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "env-fault"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ next: "report-infrastructure" });
    await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(readFileSync(counters, "utf8"))).toMatchObject({ ciEnvFaults: 0 });
  });

  test("a pending run between two env-faults does not reset the counter", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    await runGate(["CLA-1", "--run", "r1", "--ci", "env-fault"]);
    await runGate(["CLA-1", "--run", "r1", "--ci", "pending"]);
    const third = await runGate(["CLA-1", "--run", "r1", "--ci", "env-fault"]);
    expect(JSON.parse(third.logs[0] ?? "")).toMatchObject({ next: "report-infrastructure" });
  });

  test("integration fails twice then stops, a pass resets, --no-record skips", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    const counters = path.join(runDirectory, "checks", "CLA-1.json");
    const args = ["CLA-1", "--run", "r1", "--ci", "pass", "--integration"];
    const first = await runGate([...args, "fail"]);
    expect(JSON.parse(first.logs[0] ?? "")).toMatchObject({ next: "rerun-failed-specs" });
    const result = await runGate([...args, "fail"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "stop" });
    await runGate([...args, "pass"]);
    expect(JSON.parse(readFileSync(counters, "utf8"))).toMatchObject({ integrationFailures: 0 });
    rmSync(counters);
    await runGate([...args, "fail", "--no-record"]);
    expect(existsSync(counters)).toBe(false);
  });

  test("gate.onHold stop in the config restores the review-rounds behavior", async () => {
    writeJson(path.join(runDirectory, "verify", "CLA-1.json"), { ok: true });
    writeJson(path.join(root, ".emet", "review", "CLA-1.json"), {
      rounds: 5,
      findings: [{ status: "open", severity: "blocker", kind: "patch" }],
    });
    writeJson(path.join(root, "emet.config.json"), { gate: { onHold: "stop" } });
    const result = await runGate(["CLA-1", "--run", "r1", "--ci", "pass"]);
    expect(JSON.parse(result.logs[0] ?? "")).toMatchObject({ decision: "stop" });
  });
});
