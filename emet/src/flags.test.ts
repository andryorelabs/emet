import { describe, expect, test } from "bun:test";

import type { CommandSpec } from "./commands";
import { parseGlobalFlags, unknownFlags } from "./flags";

const spec: CommandSpec = {
  name: "sample",
  summary: "a sample command",
  flags: [
    { name: "--run", value: true },
    { name: "--dry-run", value: false },
  ],
  run: () => Promise.resolve(),
};

describe("parseGlobalFlags", () => {
  test("detects each global flag and strips --no-color and --verbose", () => {
    const { flags, rest } = parseGlobalFlags(["a", "--json", "--no-color", "--verbose", "-h"]);
    expect(flags).toEqual({ json: true, noColor: true, verbose: true, help: true });
    expect(rest).toEqual(["a", "--json", "-h"]);
  });

  test("reports no flags for a plain argv", () => {
    const { flags, rest } = parseGlobalFlags(["a", "b"]);
    expect(flags).toEqual({ json: false, noColor: false, verbose: false, help: false });
    expect(rest).toEqual(["a", "b"]);
  });
});

describe("unknownFlags", () => {
  test("accepts declared and global flags", () => {
    expect(unknownFlags(spec, ["--run", "x", "--dry-run", "--json", "--help"])).toEqual([]);
  });

  test("names every undeclared flag", () => {
    expect(unknownFlags(spec, ["--bogus", "--dry-run", "--other"])).toEqual(["--bogus", "--other"]);
  });

  test("lets a value flag consume a dash-prefixed value", () => {
    expect(unknownFlags(spec, ["--run", "--not-a-flag"])).toEqual([]);
  });

  test("ignores positionals, a bare dash and everything after --", () => {
    expect(unknownFlags(spec, ["pos", "-", "--", "--bogus"])).toEqual([]);
  });
});
