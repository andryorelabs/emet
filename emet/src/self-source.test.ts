import { describe, expect, test } from "bun:test";

import { embeddedTree } from "./assets";
import { sourceInstall } from "./self-source";

describe("sourceInstall (stub)", () => {
  test("fails with a message naming the checkout and writes nothing", async () => {
    const errors: string[] = [];
    const code = await sourceInstall(
      { from: "/checkout", dryRun: false, force: false },
      {
        home: "/nonexistent-emet-home",
        executablePath: "/nonexistent-emet-home/emet",
        compiled: false,
        version: "0.0.0",
        tree: embeddedTree,
        interactive: false,
        pathEnv: "",
        runSetup: () => Promise.resolve(0),
        now: () => new Date(0),
        log: () => undefined,
        error: (line) => errors.push(line),
      },
    );
    expect(code).toBe(1);
    expect(errors).toEqual([
      "emet self install --from /checkout: the source install is not available yet; nothing was written",
    ]);
  });
});
