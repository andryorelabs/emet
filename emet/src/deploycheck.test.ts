import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run, runDeployCheck, type DeployCheckDeps } from "./deploycheck";

const check = { command: "curl -f x", retries: 3, intervalSeconds: 5, timeoutSeconds: 60 };

function makeDeps(exitCodes: number[]): {
  deps: DeployCheckDeps;
  sleeps: number[];
  commands: string[];
} {
  let clock = 0;
  const sleeps: number[] = [];
  const commands: string[] = [];
  const deps: DeployCheckDeps = {
    run: (command) => {
      commands.push(command);
      return Promise.resolve(exitCodes[commands.length - 1] ?? 1);
    },
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
      return Promise.resolve();
    },
    now: () => clock,
  };
  return { deps, sleeps, commands };
}

describe("runDeployCheck", () => {
  test("is ok with 2 attempts when the command passes on the second", async () => {
    const { deps, sleeps } = makeDeps([1, 0]);
    expect(await runDeployCheck(check, deps)).toEqual({ state: "ok", attempts: 2 });
    expect(sleeps).toEqual([5000]);
  });

  test("is ok on the first attempt without sleeping", async () => {
    const { deps, sleeps } = makeDeps([0]);
    expect(await runDeployCheck(check, deps)).toEqual({ state: "ok", attempts: 1 });
    expect(sleeps).toEqual([]);
  });

  test("fails after every retry is used", async () => {
    const { deps, commands } = makeDeps([1, 1, 1]);
    expect(await runDeployCheck(check, deps)).toEqual({ state: "failed", attempts: 3 });
    expect(commands).toEqual([check.command, check.command, check.command]);
  });

  test("times out when the elapsed time passes timeoutSeconds before retries run out", async () => {
    const { deps } = makeDeps([1, 1, 1, 1, 1]);
    const result = await runDeployCheck(
      { command: "x", retries: 10, intervalSeconds: 20, timeoutSeconds: 30 },
      deps,
    );
    expect(result).toEqual({ state: "timeout", attempts: 3 });
  });
});

async function runCaptured(
  argv: string[],
): Promise<{ out: string; err: string; exitCode: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.join(" "));
  });
  const errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.join(" "));
  });
  process.exitCode = 0;
  await run(argv);
  logSpy.mockRestore();
  errorSpy.mockRestore();
  return { out: out.join("\n"), err: err.join("\n"), exitCode: process.exitCode };
}

describe("run", () => {
  const originalExitCode = process.exitCode;
  const originalCwd = process.cwd();
  const directories: string[] = [];

  afterEach(() => {
    process.exitCode = originalExitCode;
    process.chdir(originalCwd);
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function enterRepo(config: unknown): void {
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-deploycheck-test-")));
    directories.push(directory);
    Bun.spawnSync(["git", "init", "-q"], { cwd: directory });
    if (config !== undefined) {
      writeFileSync(path.join(directory, "emet.config.json"), JSON.stringify(config));
    }
    process.chdir(directory);
  }

  const baseConfig = { tracker: { kind: "local" } };

  function checkConfig(command: string, timeoutSeconds = 30): unknown {
    return {
      ...baseConfig,
      deploy: { check: { command, retries: 2, intervalSeconds: 1, timeoutSeconds } },
    };
  }

  test("skips with exit 0 when no deploy check is configured", async () => {
    enterRepo(baseConfig);
    const result = await runCaptured([]);
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain("no deploy check configured");
  });

  test("skips with exit 0 and JSON output outside a git repo", async () => {
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-deploycheck-test-")));
    directories.push(directory);
    process.chdir(directory);
    const result = await runCaptured(["--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ skipped: "no deploy check configured" });
  });

  test("exits 0 with state ok when the command passes", async () => {
    enterRepo(checkConfig("exit 0"));
    const result = await runCaptured([]);
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain('state: "ok"');
  });

  test("exits 1 with state failed when every attempt fails", async () => {
    enterRepo(checkConfig("exit 1"));
    const result = await runCaptured(["--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.out)).toEqual({ state: "failed", attempts: 2 });
  });

  test("exits 3 with state timeout when the time budget runs out first", async () => {
    enterRepo({
      ...baseConfig,
      deploy: {
        check: { command: "sleep 1; exit 1", retries: 5, intervalSeconds: 1, timeoutSeconds: 1 },
      },
    });
    const result = await runCaptured([]);
    expect(result.exitCode).toBe(3);
    expect(result.out).toContain('state: "timeout"');
  });

  test("exits 2 when the config is malformed", async () => {
    enterRepo({ ...baseConfig, deploy: { check: { command: "" } } });
    const result = await runCaptured([]);
    expect(result.exitCode).toBe(2);
    expect(result.err).toContain("deploy.check");
  });
});
