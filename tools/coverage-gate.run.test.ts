import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseFloors, runCoverageGate } from "./coverage-gate";

const LCOV = ["SF:a.ts", "FNF:4", "FNH:3", "LF:10", "LH:8", "end_of_record"].join("\n");

describe("parseFloors", () => {
  test("keeps entries with numeric lines and functions", () => {
    expect(parseFloors('{"a":{"lines":0.5,"functions":0.6}}')).toEqual({
      a: { lines: 0.5, functions: 0.6 },
    });
  });

  test("drops malformed entries", () => {
    const json = JSON.stringify({
      ok: { lines: 1, functions: 1 },
      text: { lines: "1", functions: 1 },
      missing: { lines: 1 },
      scalar: 3,
      nothing: null,
    });
    expect(parseFloors(json)).toEqual({ ok: { lines: 1, functions: 1 } });
  });

  test("returns no floors for a non-object document", () => {
    expect(parseFloors("3")).toEqual({});
    expect(parseFloors("null")).toEqual({});
  });
});

describe("runCoverageGate", () => {
  let directory = "";
  let floorsPath = "";
  let lcovPath = "";
  const log = spyOn(console, "log").mockImplementation(() => undefined);
  const error = spyOn(console, "error").mockImplementation(() => undefined);

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), "coverage-gate-"));
    floorsPath = path.join(directory, "floors.json");
    lcovPath = path.join(directory, "lcov.info");
    writeFileSync(
      floorsPath,
      JSON.stringify({
        demo: { lines: 0.8, functions: 0.75 },
        strict: { lines: 0.99, functions: 0.99 },
      }),
    );
    writeFileSync(lcovPath, LCOV);
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
    log.mockRestore();
    error.mockRestore();
  });

  test("prints usage and fails without arguments", () => {
    expect(runCoverageGate([], floorsPath)).toBe(1);
    expect(runCoverageGate(["demo"], floorsPath)).toBe(1);
    expect(error).toHaveBeenCalledWith("usage: bun tools/coverage-gate.ts <workspace> <lcov path>");
  });

  test("fails when the lcov file is missing", () => {
    expect(runCoverageGate(["demo", path.join(directory, "none.info")], floorsPath)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("lcov file not found"));
  });

  test("passes and logs when coverage meets the floor", () => {
    expect(runCoverageGate(["demo", lcovPath], floorsPath)).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("demo: lines 0.8000"));
  });

  test("fails and reports to stderr when coverage is below the floor", () => {
    expect(runCoverageGate(["strict", lcovPath], floorsPath)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("is below the floor"));
  });

  test("reads the repository floors by default", () => {
    expect(runCoverageGate(["no-such-workspace", lcovPath])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no coverage floor"));
  });
});
