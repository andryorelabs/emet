import { describe, expect, test } from "bun:test";

import { embeddedTree } from "./assets";
import type { SelfDeps } from "./self-install";
import { runSelfUpdate } from "./self-update";

function recordingDeps(errors: string[]): SelfDeps {
  return {
    home: "/nonexistent-emet-home",
    executablePath: "/nonexistent-emet-home/emet",
    compiled: true,
    version: "0.0.0",
    tree: embeddedTree,
    interactive: false,
    pathEnv: "",
    runSetup: () => Promise.resolve(0),
    now: () => new Date(0),
    log: () => undefined,
    error: (line) => errors.push(line),
  };
}

describe("runSelfUpdate (stub)", () => {
  test("fails with a message and changes nothing", async () => {
    const errors: string[] = [];
    expect(await runSelfUpdate([], recordingDeps(errors))).toBe(1);
    expect(await runSelfUpdate(["--auto"], recordingDeps(errors))).toBe(1);
    expect(errors).toEqual([
      "emet self update: not available yet; nothing was changed",
      "emet self update --auto: not available yet; nothing was changed",
    ]);
  });
});
