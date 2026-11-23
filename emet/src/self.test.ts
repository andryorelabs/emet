import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { EMET_VERSION } from "./assets";
import { processSelfDeps, run, runSetupCommand } from "./self";

const sandboxes: string[] = [];

function fakeEmet(script: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "emet-self-"));
  sandboxes.push(directory);
  const file = path.join(directory, "emet");
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

afterEach(() => {
  for (const directory of sandboxes.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("processSelfDeps", () => {
  test("reads this process: home, executable, version, embedded tree, source mode", () => {
    const deps = processSelfDeps();
    expect(deps.home).toBe(homedir());
    expect(deps.executablePath).toBe(process.execPath);
    expect(deps.compiled).toBe(false);
    expect(deps.version).toBe(EMET_VERSION);
    expect(deps.tree().list()).toContain("commands/run.md");
    expect(deps.pathEnv.length).toBeGreaterThan(0);
    expect(deps.now()).toBeInstanceOf(Date);
  });

  test("log and error write to stdout and stderr", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const deps = processSelfDeps();
      deps.log("out");
      deps.error("err");
      expect(logSpy).toHaveBeenCalledWith("out");
      expect(errorSpy).toHaveBeenCalledWith("err");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("runSetupCommand", () => {
  test("runs `<bin> setup` and resolves to its exit code", async () => {
    const bin = fakeEmet('[ "$1" = setup ] && exit 4\nexit 9');
    expect(await runSetupCommand(bin)).toBe(4);
  });

  test("rejects when the binary cannot be started", async () => {
    const outcome = await runSetupCommand(path.join(tmpdir(), "emet-missing-binary")).catch(
      (error: unknown) => error,
    );
    expect(String(outcome)).toContain("ENOENT");
  });
});

describe("run", () => {
  test("an unknown subcommand prints usage and touches nothing", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await run(["bogus"])).toBe(2);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain("usage: emet self install");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
