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
    const open = [{ severity: "blocker" as const }];
    expect(decide({ ...clean, openFindings: open }).decision).toBe("hold");
    expect(decide({ ...clean, openFindings: open, reviewRoundsUsed: 2 }).decision).toBe("stop");
  });

  test("open major blocks high tier only", () => {
    const open = [{ severity: "major" as const }];
    expect(decide({ ...clean, openFindings: open }).decision).toBe("merge");
    expect(decide({ ...clean, tier: "high", openFindings: open }).decision).toBe("hold");
  });

  test("CI red, pending or absent holds", () => {
    expect(decide({ ...clean, ci: "fail" }).decision).toBe("hold");
    expect(decide({ ...clean, ci: "pending" }).decision).toBe("hold");
    expect(decide({ ...clean, ci: "none" }).decision).toBe("hold");
  });

  test("red integration suite never merges or chains", () => {
    const result = decide({ ...clean, integration: "fail", autoChain: true, wavesRemaining: 2 });
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
      expect(JSON.parse(logs[0]!)).toMatchObject({ decision: "hold" });
      expect(
        JSON.parse(readFileSync(path.join(runDir, "attempts", "CLA-1.json"), "utf8")),
      ).toMatchObject({ count: 1 });
    } finally {
      console.log = originalLog;
      process.chdir(previous);
    }
  });
});
