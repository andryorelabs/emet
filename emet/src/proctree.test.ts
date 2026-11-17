import { describe, expect, test } from "bun:test";

import {
  defaultProcessTreeReader,
  readParent,
  runPsForPid,
  type ProcessTreeReader,
} from "./proctree";

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

  test("returns null for a malformed procfs stat line", () => {
    expect(readParent(10, procfsReader({ 10: "10 no parens here" }))).toBeNull();
    expect(readParent(10, procfsReader({ 10: "10 )x( S 77" }))).toBeNull();
  });

  test("returns null for a non-positive or non-numeric parent pid", () => {
    expect(readParent(10, procfsReader({ 10: "10 (init) S 0 1" }))).toBeNull();
    expect(readParent(10, procfsReader({ 10: "10 (init) S abc 1" }))).toBeNull();
    expect(readParent(10, psReader({ 10: "0 init" }))).toBeNull();
  });

  test("returns null when the reader throws", () => {
    const reader: ProcessTreeReader = {
      hasProcfs: () => {
        throw new Error("boom");
      },
      readFile: () => "",
      runPs: () => null,
    };
    expect(readParent(10, reader)).toBeNull();
  });
});

describe("defaultProcessTreeReader", () => {
  test("reads the real parent of this process through the default reader", () => {
    const info = readParent(process.pid);
    expect(info?.ppid).toBe(process.ppid);
    expect(info?.comm.length).toBeGreaterThan(0);
  });

  test("runPs reports this process's parent and null for a missing pid", () => {
    const output = defaultProcessTreeReader.runPs(process.pid);
    expect(output).not.toBeNull();
    expect(output?.trim().startsWith(String(process.ppid))).toBe(true);
    expect(defaultProcessTreeReader.runPs(2 ** 22 + 12345)).toBeNull();
  });

  test("readFile reads a real file and hasProcfs reflects the host", () => {
    expect(defaultProcessTreeReader.hasProcfs()).toBe(process.platform === "linux");
    if (process.platform === "linux") {
      expect(defaultProcessTreeReader.readFile("/proc/self/stat")).toContain(`${process.pid} (`);
    }
  });

  test("runPsForPid returns null when spawning throws or ps fails", () => {
    expect(
      runPsForPid(1, () => {
        throw new Error("spawn failed");
      }),
    ).toBeNull();
    expect(runPsForPid(1, () => ({ status: 1, stdout: "" }))).toBeNull();
    expect(runPsForPid(1, () => ({ status: 0, stdout: null }))).toBeNull();
    expect(runPsForPid(1, () => ({ status: 0, stdout: "7 init\n" }))).toBe("7 init\n");
  });
});
