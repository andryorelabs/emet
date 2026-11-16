import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { currentExitCode } from "./exit-code";
import { LEGACY_PRODUCT } from "./names";
import { run, type SlotsRunDeps } from "./slots";

let repo: string;
let stateDirectory: string;
const originalCwd = process.cwd();
const originalEnvironment = {
  stateDir: process.env.EMET_STATE_DIR,
  maxLive: process.env.EMET_MAX_LIVE_WORKERS,
  reserve: process.env.EMET_MEM_RESERVE_GIB,
};

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = value;
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-slots-cli-")));
  stateDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-slots-state-")));
  const init = Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: repo });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString());
  copyFileSync(
    path.join(import.meta.dir, "..", "..", "emet.config.json"),
    path.join(repo, "emet.config.json"),
  );
  process.env.EMET_STATE_DIR = stateDirectory;
  process.env.EMET_MAX_LIVE_WORKERS = "2";
  process.env.EMET_MEM_RESERVE_GIB = "0.001";
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(repo, { recursive: true, force: true });
  rmSync(stateDirectory, { recursive: true, force: true });
  restoreEnvironment("EMET_STATE_DIR", originalEnvironment.stateDir);
  restoreEnvironment("EMET_MAX_LIVE_WORKERS", originalEnvironment.maxLive);
  restoreEnvironment("EMET_MEM_RESERVE_GIB", originalEnvironment.reserve);
  process.exitCode = 0;
});

async function invoke(
  argv: string[],
  deps?: SlotsRunDeps,
): Promise<{ out: string[]; err: string[]; code: number }> {
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
    await run(argv, deps);
    return { out, err, code: currentExitCode() };
  } finally {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

const acquireArguments = (runId: string, ticket: string): string[] => [
  "--acquire",
  "--run",
  runId,
  "--anchor",
  String(process.pid),
  "--ticket",
  ticket,
];

describe("slots run in-process", () => {
  test("--list on an empty pool reports none occupied against the env cap", async () => {
    const result = await invoke(["--list"]);
    expect(result.code).toBe(0);
    expect(result.out[0]).toContain("no slots occupied (0/2, cap=EMET_MAX_LIVE_WORKERS)");
  });

  test("with no mode flag it prints usage and exits 1", async () => {
    const result = await invoke(["--bogus"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("usage: emet slots");
  });

  test("--acquire without --run reports the missing value", async () => {
    const result = await invoke(["--acquire"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("--run requires a value");
  });

  test("acquire takes a slot, list shows it, release frees it", async () => {
    const acquired = await invoke([
      "--acquire",
      "--run",
      "run-x",
      "--anchor",
      String(process.pid),
      "--ticket",
      "CLA-1",
    ]);
    expect(acquired.code).toBe(0);
    expect(acquired.out[0]).toContain("acquired slot 0 for CLA-1");

    const listed = await invoke(["--list"]);
    expect(listed.out.join("\n")).toContain("run=run-x");
    expect(listed.out.join("\n")).toContain("ticket=CLA-1");
    expect(listed.out.join("\n")).toContain("(1/2 occupied, cap=EMET_MAX_LIVE_WORKERS)");

    const released = await invoke(["--release", "--run", "run-x", "--ticket", "CLA-1"]);
    expect(released.out[0]).toContain("released 1 slot(s) for run run-x (ticket CLA-1): 0");

    const after = await invoke(["--list"]);
    expect(after.out[0]).toContain("no slots occupied");
  });

  test("--release-index refuses another run's slot unless forced", async () => {
    await invoke([
      "--acquire",
      "--run",
      "run-x",
      "--anchor",
      String(process.pid),
      "--ticket",
      "CLA-1",
    ]);
    const refused = await invoke(["--release-index", "0", "--run", "run-y"]);
    expect(refused.code).toBe(1);
    expect(refused.err.join("\n")).toContain("held by run run-x, not run-y");

    const forced = await invoke(["--release-index", "0", "--run", "run-y", "--force"]);
    expect(forced.code).toBe(0);
    expect(forced.out[0]).toContain("released slot 0");
    expect((await invoke(["--list"])).out[0]).toContain("no slots occupied");
  });

  test("--release of an unknown run releases nothing", async () => {
    const result = await invoke(["--release", "--run", "ghost"]);
    expect(result.out[0]).toContain("released 0 slot(s) for run ghost.");
  });

  test("--acquire is denied by the memory brake when the reserve exceeds host memory", async () => {
    process.env.EMET_MEM_RESERVE_GIB = "100000000";
    const result = await invoke(acquireArguments("run-x", "CLA-1"));
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("denied by the memory brake");
    expect((await invoke(["--list"])).out[0]).toContain("no slots occupied");
  });

  test("--acquire reports a full pool when the holder run is live and leaves it in place", async () => {
    process.env.EMET_MAX_LIVE_WORKERS = "1";
    expect((await invoke(acquireArguments("run-x", "CLA-1"))).code).toBe(0);
    const denied = await invoke(acquireArguments("run-y", "CLA-2"), {
      classifyRunOptions: { isAnchorAliveFn: () => true },
    });
    expect(denied.code).toBe(1);
    expect(denied.err.join("\n")).toContain("no free slot (all 1 occupied");
    expect((await invoke(["--list"])).out.join("\n")).toContain("run=run-x");
  });

  test("--list notes leftover entries of the legacy per-repo pool", async () => {
    const legacySlots = path.join(repo, ".git", LEGACY_PRODUCT, "slots");
    mkdirSync(path.join(legacySlots, "0"), { recursive: true });
    const result = await invoke(["--list"]);
    expect(result.out.join("\n")).toContain("leftover from the pre-host-wide per-repo pool");
  });

  test("--list is silent about an empty legacy pool", async () => {
    mkdirSync(path.join(repo, ".git", LEGACY_PRODUCT, "slots"), { recursive: true });
    const result = await invoke(["--list"]);
    expect(result.out.join("\n")).not.toContain("leftover");
  });

  test("an unexpected failure is logged and exits 1", async () => {
    const blocker = path.join(stateDirectory, "blocker");
    writeFileSync(blocker, "file");
    process.env.EMET_STATE_DIR = blocker;
    const result = await invoke(acquireArguments("run-x", "CLA-1"));
    expect(result.code).toBe(1);
    expect(result.err.length).toBeGreaterThan(0);
  });

  test("outside a git repository it exits 2", async () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-slots-nogit-")));
    const originalLog = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      process.chdir(outside);
      process.exitCode = 0;
      await run(["--list"]);
      expect(currentExitCode()).toBe(2);
    } finally {
      process.chdir(originalCwd);
      originalLog.mockRestore();
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
