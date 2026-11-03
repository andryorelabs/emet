import { describe, expect, test } from "bun:test";
import { readParent, type ProcessTreeReader } from "./proctree";

function procfsReader(stats: Record<number, string>): ProcessTreeReader {
  return {
    hasProcfs: () => true,
    readFile: (filePath) => {
      const pid = Number(/\/proc\/(\d+)\/stat/.exec(filePath)?.[1]);
      const stat = stats[pid];
      if (stat === undefined) throw new Error("ENOENT");
      return stat;
    },
    runPs: () => {
      throw new Error("ps must not run when procfs is present");
    },
  };
}

function psReader(outputs: Record<number, string>): ProcessTreeReader {
  return {
    hasProcfs: () => false,
    readFile: () => {
      throw new Error("procfs must not be read");
    },
    runPs: (pid) => outputs[pid] ?? null,
  };
}

describe("readParent", () => {
  test("parses procfs stat, including comm with spaces and parens", () => {
    const reader = procfsReader({ 10: "10 (my) proc) S 77 10 10 0" });
    expect(readParent(10, reader)).toEqual({ ppid: 77, comm: "my) proc" });
  });

  test("returns null for a missing procfs entry", () => {
    expect(readParent(10, procfsReader({}))).toBeNull();
  });

  test("falls back to ps and reduces a path comm to its basename", () => {
    const reader = psReader({ 10: "  42 /usr/local/bin/claude\n" });
    expect(readParent(10, reader)).toEqual({ ppid: 42, comm: "claude" });
  });

  test("returns null when ps finds nothing or output is garbage", () => {
    expect(readParent(10, psReader({}))).toBeNull();
    expect(readParent(10, psReader({ 10: "nonsense" }))).toBeNull();
  });
});
