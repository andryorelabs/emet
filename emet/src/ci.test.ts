import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { run, waitForChecks } from "./ci";

describe("ci skeleton", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0;
  });

  test("exits 2 with a not implemented message", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await run([]);
      expect(process.exitCode).toBe(2);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("not implemented");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

function rollup(checks: object[]): string {
  return JSON.stringify({ statusCheckRollup: checks });
}

const done = (name: string, conclusion: string, runId = 1) => ({
  name,
  status: "COMPLETED",
  conclusion,
  detailsUrl: `https://github.com/o/r/actions/runs/${runId}/job/9`,
});

function harness(responses: string[]) {
  const calls: string[][] = [];
  let clock = 0;
  let index = 0;
  return {
    calls,
    deps: {
      gh: (args: readonly string[]) => {
        calls.push([...args]);
        if (args[0] === "run") return Promise.resolve("");
        const response = responses[Math.min(index, responses.length - 1)] ?? rollup([]);
        index += 1;
        return Promise.resolve(response);
      },
      sleep: (ms: number) => {
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    },
  };
}

const baseOptions = { pr: 7, timeoutMs: 10_000, pollMs: 1_000, rerunFlakes: false };

describe("waitForChecks", () => {
  test("passes when all checks pass", async () => {
    const { deps } = harness([rollup([done("a", "SUCCESS")])]);
    expect(await waitForChecks(baseOptions, deps)).toEqual({
      state: "pass",
      failedChecks: [],
      flakeReruns: 0,
      noChecks: false,
    });
  });

  test("passes with noChecks when the PR has no checks", async () => {
    const { deps } = harness([rollup([])]);
    expect(await waitForChecks(baseOptions, deps)).toMatchObject({ state: "pass", noChecks: true });
  });

  test("polls pending checks until they pass", async () => {
    const { deps, calls } = harness([
      rollup([{ name: "a", status: "IN_PROGRESS" }]),
      rollup([done("a", "SUCCESS")]),
    ]);
    expect(await waitForChecks(baseOptions, deps)).toMatchObject({ state: "pass" });
    expect(calls).toHaveLength(2);
  });

  test("times out while checks stay pending", async () => {
    const { deps } = harness([rollup([{ name: "a", status: "IN_PROGRESS" }])]);
    expect(await waitForChecks(baseOptions, deps)).toMatchObject({ state: "timeout" });
  });

  test("fails without rerun when rerunFlakes is off", async () => {
    const { deps, calls } = harness([rollup([done("lint", "FAILURE")])]);
    expect(await waitForChecks(baseOptions, deps)).toEqual({
      state: "fail",
      failedChecks: ["lint"],
      flakeReruns: 0,
      noChecks: false,
    });
    expect(calls.some((call) => call[0] === "run")).toBe(false);
  });

  test("reports a flake that passes on rerun", async () => {
    const { deps, calls } = harness([
      rollup([done("lint", "FAILURE", 42)]),
      rollup([{ name: "lint", status: "IN_PROGRESS" }]),
      rollup([done("lint", "SUCCESS", 42)]),
    ]);
    const outcome = await waitForChecks({ ...baseOptions, rerunFlakes: true }, deps);
    expect(outcome).toMatchObject({ state: "pass", flakeReruns: 1 });
    expect(calls).toContainEqual(["run", "rerun", "42", "--failed"]);
  });

  test("fails when a check fails again after its rerun", async () => {
    const { deps, calls } = harness([rollup([done("lint", "FAILURE", 42)])]);
    const outcome = await waitForChecks({ ...baseOptions, rerunFlakes: true }, deps);
    expect(outcome).toMatchObject({ state: "fail", failedChecks: ["lint"], flakeReruns: 1 });
    expect(calls.filter((call) => call[0] === "run")).toHaveLength(1);
  });

  test("times out when the rerun never finishes", async () => {
    const { deps } = harness([rollup([done("lint", "FAILURE", 42)])]);
    const outcome = await waitForChecks(
      { ...baseOptions, rerunFlakes: true, timeoutMs: 1_000 },
      deps,
    );
    expect(outcome.state).toBe("timeout");
  });

  test("reports env-fault for a STARTUP_FAILURE check", async () => {
    const { deps } = harness([rollup([done("ci", "STARTUP_FAILURE")])]);
    expect(await waitForChecks(baseOptions, deps)).toMatchObject({ state: "env-fault" });
  });

  test("names unnamed failed checks and skips runs without an id", async () => {
    const { deps, calls } = harness([
      rollup([{ status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://x/y" }]),
    ]);
    const outcome = await waitForChecks({ ...baseOptions, rerunFlakes: true }, deps);
    expect(outcome.failedChecks).toEqual(["unnamed check"]);
    expect(calls.some((call) => call[0] === "run")).toBe(false);
  });
});
