import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { lookupTicket, recordTicket, run } from "./materializelog";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "emet-materialize-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
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
  try {
    await run(argv);
    return { out, err, code: process.exitCode ?? 0 };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

describe("materialize-log run", () => {
  test("exits 2 with usage without a run id", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage: emet materialize-log");
  });

  test("exits 2 with usage when no action flag is given", async () => {
    const result = await invoke(["--run", "r1", "--root", root]);
    expect(result.code).toBe(2);
  });

  test("record then lookup prints the tracker id", async () => {
    const recorded = await invoke(["--run", "r1", "--root", root, "--record", "T1", "CLA-10"]);
    expect(recorded.code).toBe(0);
    const looked = await invoke(["--run", "r1", "--root", root, "--lookup", "T1"]);
    expect(looked.code).toBe(0);
    expect(looked.out).toEqual(["CLA-10"]);
  });

  test("lookup of an unrecorded key exits 1 and prints nothing", async () => {
    const result = await invoke(["--run", "r1", "--root", root, "--lookup", "nope"]);
    expect(result.code).toBe(1);
    expect(result.out).toEqual([]);
  });

  test("record without a tracker id exits 2", async () => {
    const result = await invoke(["--run", "r1", "--root", root, "--record", "T1"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage:");
  });

  test("re-recording a key with a different id exits 2", async () => {
    await invoke(["--run", "r1", "--root", root, "--record", "T1", "CLA-10"]);
    const result = await invoke(["--run", "r1", "--root", root, "--record", "T1", "CLA-11"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("already recorded as CLA-10");
  });
});

describe("materialize log files", () => {
  test("recording the same pair twice is a no-op", () => {
    const logPath = path.join(root, "sub", "log.json");
    recordTicket(logPath, "T1", "CLA-1");
    recordTicket(logPath, "T1", "CLA-1");
    expect(JSON.parse(readFileSync(logPath, "utf8"))).toEqual({ T1: "CLA-1" });
  });

  test("an unreadable log throws naming the path", () => {
    const logPath = path.join(root, "log.json");
    writeFileSync(logPath, "{not json");
    expect(() => lookupTicket(logPath, "T1")).toThrow("is unreadable");
  });

  test("a non-object log throws", () => {
    const logPath = path.join(root, "log.json");
    writeFileSync(logPath, "[1]");
    expect(() => lookupTicket(logPath, "T1")).toThrow("not a key/ticket map");
  });

  test("non-string entries are dropped when reading", () => {
    const logPath = path.join(root, "log.json");
    writeFileSync(logPath, JSON.stringify({ A: "CLA-1", B: 5 }));
    expect(lookupTicket(logPath, "A")).toBe("CLA-1");
    expect(lookupTicket(logPath, "B")).toBeNull();
  });
});
