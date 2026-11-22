import { describe, expect, test } from "bun:test";

import { DEFERRED_LABEL, decide, isEnvFault, type GateInput } from "./gate";

const clean: GateInput = {
  verifyOk: true,
  tier: "medium",
  openFindings: [],
  reviewRoundsUsed: 1,
  reviewRoundsCap: 2,
  ci: "pass",
  integration: "none",
  onHold: "fix-and-continue",
  fixRoundsUsed: 0,
  fixRoundsCap: 2,
  integrationFailures: 0,
  ciEnvFaults: 0,
  attemptsUsed: 1,
  workerAttempts: 2,
  envFault: false,
  autoChain: false,
  wavesRemaining: 0,
};

describe("isEnvFault", () => {
  test("exit 126 and 127 are env faults", () => {
    expect(isEnvFault(126, "")).toBe(true);
    expect(isEnvFault(127, "")).toBe(true);
  });
  test("provider outage patterns are env faults", () => {
    expect(isEnvFault(1, "API Error: 529 overloaded_error")).toBe(true);
    expect(isEnvFault(1, "ECONNRESET while calling provider")).toBe(true);
  });
  test("an ordinary test failure is not", () => {
    expect(isEnvFault(1, "3 tests failed")).toBe(false);
    expect(isEnvFault(0, "")).toBe(false);
  });
});

describe("decide", () => {
  test("clean ticket merges", () => {
    expect(decide(clean).decision).toBe("merge");
  });

  test("env fault holds without charging an attempt", () => {
    const result = decide({ ...clean, verifyOk: false, envFault: true, attemptsUsed: 2 });
    expect(result.decision).toBe("hold");
    expect(result.chargeAttempt).toBe(false);
  });

  test("failed verify with attempts left holds and charges", () => {
    const result = decide({ ...clean, verifyOk: false });
    expect(result.decision).toBe("hold");
    expect(result.chargeAttempt).toBe(true);
  });

  test("exhausted ticket is deferred with the label", () => {
    const result = decide({ ...clean, verifyOk: false, attemptsUsed: 2 });
    expect(result.decision).toBe("defer");
    expect(result.label).toBe(DEFERRED_LABEL);
  });

  test("missing verify record holds", () => {
    expect(decide({ ...clean, verifyOk: null }).decision).toBe("hold");
  });

  test("open blocker holds while rounds remain, stops at the cap", () => {
    const open = [{ severity: "blocker" as const, kind: "patch" as const }];
    const stopMode = { ...clean, onHold: "stop" as const, openFindings: open };
    expect(decide(stopMode).decision).toBe("hold");
    expect(decide(stopMode).next).toBeUndefined();
    expect(decide({ ...stopMode, reviewRoundsUsed: 2 }).decision).toBe("stop");
  });

  test("open major blocks high tier only", () => {
    const open = [{ severity: "major" as const, kind: "patch" as const }];
    expect(decide({ ...clean, openFindings: open }).decision).toBe("merge");
    expect(decide({ ...clean, tier: "high", openFindings: open }).decision).toBe("hold");
  });

  test("CI red, pending or absent holds", () => {
    expect(decide({ ...clean, ci: "fail" }).decision).toBe("hold");
    expect(decide({ ...clean, ci: "pending" }).decision).toBe("hold");
    expect(decide({ ...clean, ci: "none" }).decision).toBe("hold");
  });

  test("red integration suite never merges or chains", () => {
    const result = decide({
      ...clean,
      integration: "fail",
      integrationFailures: 2,
      autoChain: true,
      wavesRemaining: 2,
    });
    expect(result.decision).toBe("stop");
    expect(result.reasons.join(" ")).toContain("integration");
  });

  test("chain needs autoChain, a passing integration suite and waves remaining", () => {
    const base = { ...clean, autoChain: true, wavesRemaining: 1 };
    expect(decide({ ...base, integration: "pass" }).decision).toBe("chain");
    expect(decide({ ...base, integration: "none" }).decision).toBe("merge");
    expect(decide({ ...base, integration: "pass", wavesRemaining: 0 }).decision).toBe("merge");
    expect(decide({ ...base, integration: "pass", autoChain: false }).decision).toBe("merge");
  });

  test("open patch findings hold for a fix round while rounds remain", () => {
    const openFindings = [
      { severity: "blocker" as const, kind: "patch" as const },
      { severity: "critical" as const, kind: "patch" as const },
    ];
    const result = decide({ ...clean, openFindings });
    expect(result).toMatchObject({ decision: "hold", next: "fix-findings", chargeAttempt: false });
    expect(decide({ ...clean, openFindings, fixRoundsUsed: 1 }).next).toBe("fix-findings");
  });

  test("an open intent_gap finding stops", () => {
    const openFindings = [{ severity: "minor" as const, kind: "intent_gap" as const }];
    expect(decide({ ...clean, openFindings }).decision).toBe("stop");
  });

  test("exhausted fix rounds with a blocking finding stop", () => {
    const openFindings = [{ severity: "blocker" as const, kind: "patch" as const }];
    const result = decide({ ...clean, openFindings, fixRoundsUsed: 2 });
    expect(result.decision).toBe("stop");
    expect(result.reasons.join(" ")).toContain("fix rounds exhausted");
  });

  test("first integration failure reruns failed specs, second stops", () => {
    const first = decide({ ...clean, integration: "fail", integrationFailures: 1 });
    expect(first).toMatchObject({ decision: "hold", next: "rerun-failed-specs" });
    expect(decide({ ...clean, integration: "fail", integrationFailures: 2 }).decision).toBe("stop");
  });

  test("integration failure stops at once under onHold stop", () => {
    const result = decide({
      ...clean,
      onHold: "stop",
      integration: "fail",
      integrationFailures: 1,
    });
    expect(result.decision).toBe("stop");
  });

  test("a CI env-fault holds for a rerun, twice in a row reports infrastructure", () => {
    const first = decide({ ...clean, ci: "env-fault", ciEnvFaults: 1 });
    expect(first).toMatchObject({ decision: "hold", next: "rerun-ci", chargeAttempt: false });
    const second = decide({ ...clean, ci: "env-fault", ciEnvFaults: 2 });
    expect(second).toMatchObject({
      decision: "hold",
      next: "report-infrastructure",
      chargeAttempt: false,
    });
  });

  test("pending integration suite holds", () => {
    expect(decide({ ...clean, integration: "pending" }).decision).toBe("hold");
  });
});

describe("gate attempt persistence", () => {
  test("run() records a charged attempt and eventually defers", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const root = mkdtempSync(path.join(tmpdir(), "gate-"));
    const runDir = path.join(root, ".emet", "runs", "r1");
    mkdirSync(path.join(runDir, "verify"), { recursive: true });
    writeFileSync(path.join(runDir, "verify", "CLA-1.json"), JSON.stringify({ ok: false }));
    const previous = process.cwd();
    process.chdir(root);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (line: string) => void logs.push(line);
    try {
      const { run } = await import("./gate");
      await run(["CLA-1", "--run", "r1"]);
      expect(JSON.parse(logs[0] ?? "")).toMatchObject({ decision: "hold" });
      expect(
        JSON.parse(readFileSync(path.join(runDir, "attempts", "CLA-1.json"), "utf8")),
      ).toMatchObject({ count: 1 });
    } finally {
      console.log = originalLog;
      process.chdir(previous);
    }
  });
});

describe("gate on a legacy-only run dir", () => {
  test("run() reads and writes run state under .forge when .emet is absent", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const root = mkdtempSync(path.join(tmpdir(), "gate-"));
    const runDir = path.join(root, ".forge", "runs", "r1");
    mkdirSync(path.join(runDir, "verify"), { recursive: true });
    writeFileSync(path.join(runDir, "verify", "CLA-1.json"), JSON.stringify({ ok: false }));
    const previous = process.cwd();
    process.chdir(root);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (line: string) => void logs.push(line);
    try {
      const { run } = await import("./gate");
      await run(["CLA-1", "--run", "r1"]);
      expect(JSON.parse(logs[0] ?? "")).toMatchObject({ decision: "hold" });
      expect(
        JSON.parse(readFileSync(path.join(runDir, "attempts", "CLA-1.json"), "utf8")),
      ).toMatchObject({ count: 1 });
    } finally {
      console.log = originalLog;
      process.chdir(previous);
    }
  });
});

async function runGateIn(root: string): Promise<void> {
  const previous = process.cwd();
  process.chdir(root);
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    const { run } = await import("./gate");
    await run(["CLA-1", "--run", "r1"]);
  } finally {
    console.log = originalLog;
    process.chdir(previous);
  }
}

async function makeRoot(): Promise<string> {
  const { mkdtempSync, mkdirSync, realpathSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "gate-phase-")));
  const runDir = path.join(root, ".emet", "runs", "r1");
  mkdirSync(path.join(runDir, "verify"), { recursive: true });
  writeFileSync(path.join(runDir, "verify", "CLA-1.json"), JSON.stringify({ ok: false }));
  return root;
}

describe("gate phase file", () => {
  test("writes the checking phase", async () => {
    const { readPhase } = await import("./phase");
    const root = await makeRoot();
    await runGateIn(root);
    expect(readPhase(root)?.phase).toBe("checking");
  });

  test("an unwritable phase file does not change the exit code", async () => {
    const { mkdirSync } = await import("node:fs");
    const path = await import("node:path");
    const root = await makeRoot();
    mkdirSync(path.join(root, ".emet", "phase.json"), { recursive: true });
    const previousExit = process.exitCode;
    await runGateIn(root);
    expect(process.exitCode ?? 0).toBe(previousExit ?? 0);
  });
});

describe("pre-existing and user option findings", () => {
  const blocker = { severity: "blocker" as const, kind: "patch" as const };

  test("a pre-existing blocker does not hold and the reason counts it", () => {
    const result = decide({ ...clean, openFindings: [{ ...blocker, preexisting: true }] });
    expect(result.decision).toBe("merge");
    expect(result.reasons.join(" ")).toContain("1 pre-existing finding(s) ignored");
  });

  test("a pre-existing intent_gap does not stop", () => {
    const openFindings = [
      { severity: "minor" as const, kind: "intent_gap" as const, preexisting: true },
    ];
    expect(decide({ ...clean, openFindings }).decision).toBe("merge");
  });

  test("a minor userOption finding holds for a fix round at tier medium", () => {
    const openFindings = [{ severity: "minor" as const, kind: "patch" as const, userOption: "S2" }];
    expect(decide({ ...clean, openFindings })).toMatchObject({
      decision: "hold",
      next: "fix-findings",
    });
  });

  test("a pre-existing userOption finding still blocks", () => {
    const openFindings = [
      { severity: "nit" as const, kind: "patch" as const, userOption: "S2", preexisting: true },
    ];
    const result = decide({ ...clean, openFindings });
    expect(result).toMatchObject({ decision: "hold", next: "fix-findings" });
    expect(result.reasons.join(" ")).not.toContain("ignored");
  });

  test("a userOption finding stops once fix rounds are exhausted", () => {
    const openFindings = [{ severity: "minor" as const, kind: "patch" as const, userOption: "S2" }];
    expect(decide({ ...clean, openFindings, fixRoundsUsed: 2 }).decision).toBe("stop");
  });

  test("a userOption finding holds under onHold stop", () => {
    const openFindings = [{ severity: "nit" as const, kind: "patch" as const, userOption: "S2" }];
    expect(decide({ ...clean, onHold: "stop", openFindings }).decision).toBe("hold");
  });
});
