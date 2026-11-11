import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./slots";

let repo: string;
let stateDirectory: string;
const originalCwd = process.cwd();
const originalEnvironment = {
  stateDir: process.env["EMET_STATE_DIR"],
  maxLive: process.env["EMET_MAX_LIVE_WORKERS"],
  reserve: process.env["EMET_MEM_RESERVE_GIB"],
};

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
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
  process.env["EMET_STATE_DIR"] = stateDirectory;
  process.env["EMET_MAX_LIVE_WORKERS"] = "2";
  process.env["EMET_MEM_RESERVE_GIB"] = "0.001";
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
});
