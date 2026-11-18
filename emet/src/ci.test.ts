import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { realGh, run, waitForChecks } from "./ci";

function rollup(checks: object[]): string {
  return JSON.stringify({ statusCheckRollup: checks });
}

const done = (name: string, conclusion: string, runId = 1, startedAt = "2026-01-01T00:00:00Z") => ({
  name,
  startedAt,
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
    const { deps, calls } = harness([
      rollup([done("lint", "FAILURE", 42)]),
      rollup([done("lint", "FAILURE", 42, "2026-01-01T00:10:00Z")]),
    ]);
    const outcome = await waitForChecks({ ...baseOptions, rerunFlakes: true }, deps);
    expect(outcome).toMatchObject({ state: "fail", failedChecks: ["lint"], flakeReruns: 1 });
    expect(calls.filter((call) => call[0] === "run")).toHaveLength(1);
  });

  test("does not read the still-visible original failure as final after a rerun", async () => {
    const { deps } = harness([
      rollup([done("lint", "FAILURE", 42)]),
      rollup([done("lint", "FAILURE", 42)]),
      rollup([{ name: "lint", status: "IN_PROGRESS" }]),
      rollup([done("lint", "SUCCESS", 42)]),
    ]);
    const outcome = await waitForChecks({ ...baseOptions, rerunFlakes: true }, deps);
    expect(outcome).toMatchObject({ state: "pass", flakeReruns: 1 });
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

async function runWith(argv: string[], responses: string[]) {
  const { deps } = harness(responses);
  const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
  const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await run(argv, deps);
    return {
      logs: logSpy.mock.calls.flat().join("\n"),
      errors: errorSpy.mock.calls.flat().join("\n"),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

describe("run", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0;
  });

  test("prints the outcome and exits 0 on pass", async () => {
    const { logs } = await runWith(["--pr", "7", "--wait"], [rollup([done("a", "SUCCESS")])]);
    expect(JSON.parse(logs)).toEqual({
      state: "pass",
      failedChecks: [],
      flakeReruns: 0,
      noChecks: false,
    });
    expect(process.exitCode).toBe(0);
  });

  test("exits 1 on a failure and 1 on an env-fault", async () => {
    const failed = await runWith(["--pr", "7", "--wait"], [rollup([done("lint", "FAILURE")])]);
    expect(JSON.parse(failed.logs)).toMatchObject({ state: "fail", failedChecks: ["lint"] });
    expect(process.exitCode).toBe(1);
    await runWith(["--pr", "7", "--wait"], [rollup([done("ci", "STARTUP_FAILURE")])]);
    expect(process.exitCode).toBe(1);
  });

  test("exits 3 on timeout", async () => {
    const { logs } = await runWith(
      ["--pr", "7", "--wait", "--timeout-minutes", "1", "--poll-seconds", "10"],
      [rollup([{ name: "a", status: "IN_PROGRESS" }])],
    );
    expect(JSON.parse(logs)).toMatchObject({ state: "timeout" });
    expect(process.exitCode).toBe(3);
  });

  test("exits 2 on unknown or missing flags", async () => {
    expect((await runWith(["--pr", "7", "--wait", "--bogus"], [])).errors).toContain("--bogus");
    expect(process.exitCode).toBe(2);
    await runWith(["--wait"], []);
    expect(process.exitCode).toBe(2);
    await runWith(["--pr", "7"], []);
    expect(process.exitCode).toBe(2);
    await runWith(["--pr", "7", "--wait", "--poll-seconds", "0"], []);
    expect(process.exitCode).toBe(2);
  });

  test("exits 1 when gh fails", async () => {
    const logSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await run(["--pr", "7", "--wait"], {
        gh: () => Promise.reject(new Error("gh down")),
        sleep: () => Promise.resolve(),
        now: () => 0,
      });
      expect(process.exitCode).toBe(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("uses the real gh, sleep and clock by default", async () => {
    const bin = mkdtempSync(path.join(os.tmpdir(), "emet-ci-run-"));
    const originalPath = process.env.PATH;
    writeFileSync(
      path.join(bin, "gh"),
      `#!/bin/sh\necho '{"statusCheckRollup":[{"name":"a","status":"IN_PROGRESS"}]}'\n`,
    );
    chmodSync(path.join(bin, "gh"), 0o755);
    process.env.PATH = `${bin}:${originalPath ?? ""}`;
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await run(["--pr", "7", "--wait", "--timeout-minutes", "0.0005", "--poll-seconds", "0.01"]);
      expect(process.exitCode).toBe(3);
    } finally {
      logSpy.mockRestore();
      process.env.PATH = originalPath;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe("realGh", () => {
  test("resolves with stdout and rejects with stderr on a non-zero exit", async () => {
    const bin = mkdtempSync(path.join(os.tmpdir(), "emet-ci-gh-"));
    const originalPath = process.env.PATH;
    writeFileSync(
      path.join(bin, "gh"),
      '#!/bin/sh\nif [ "$1" = "ok" ]; then echo fine; exit 0; fi\necho broken >&2\nexit 1\n',
    );
    chmodSync(path.join(bin, "gh"), 0o755);
    process.env.PATH = `${bin}:${originalPath ?? ""}`;
    try {
      expect((await realGh(["ok"])).trim()).toBe("fine");
      expect(
        await realGh(["bad"]).then(
          () => "",
          (error: unknown) => (error instanceof Error ? error.message : ""),
        ),
      ).toBe("broken");
    } finally {
      process.env.PATH = originalPath;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
