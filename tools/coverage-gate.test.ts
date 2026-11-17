import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  evaluateCoverage,
  evaluatePerFile,
  parseLcovFiles,
  parseLcovTotals,
  runCoverageGate,
} from "./coverage-gate";

const LCOV = [
  "TN:",
  "SF:a.ts",
  "FNF:4",
  "FNH:3",
  "LF:10",
  "LH:8",
  "end_of_record",
  "SF:b.ts",
  "FNF:1",
  "FNH:1",
  "LF:10",
  "LH:9",
  "end_of_record",
].join("\n");

const FLOORS = { demo: { lines: 0.85, functions: 0.8 } };

describe("parseLcovTotals", () => {
  test("sums every record", () => {
    expect(parseLcovTotals(LCOV)).toEqual({ lines: 0.85, functions: 0.8 });
  });

  test("an empty report has zero coverage", () => {
    expect(parseLcovTotals("")).toEqual({ lines: 0, functions: 0 });
  });
});

describe("evaluateCoverage", () => {
  test("passes at the floor", () => {
    expect(evaluateCoverage("demo", { lines: 0.85, functions: 0.8 }, FLOORS).passed).toBe(true);
  });

  test("fails just below on lines", () => {
    expect(evaluateCoverage("demo", { lines: 0.849, functions: 0.8 }, FLOORS).passed).toBe(false);
  });

  test("fails just below on functions", () => {
    expect(evaluateCoverage("demo", { lines: 0.9, functions: 0.799 }, FLOORS).passed).toBe(false);
  });

  test("fails when the workspace has no floor", () => {
    const result = evaluateCoverage("other", { lines: 1, functions: 1 }, FLOORS);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no coverage floor");
  });
});

const GOOD = { file: "tools/a.ts", lines: 0.99, functions: 1 };
const WEAK = { file: "tools/b.ts", lines: 0.9, functions: 0.95 };
const EXCEPTION = {
  file: "tools/b.ts",
  reason: "spawns a real daemon",
  lines: 0.9,
  functions: 0.95,
};

describe("parseLcovFiles", () => {
  test("returns one fraction pair per record", () => {
    expect(parseLcovFiles(LCOV)).toEqual([
      { file: "a.ts", lines: 0.8, functions: 0.75 },
      { file: "b.ts", lines: 0.9, functions: 1 },
    ]);
  });

  test("a record with nothing to count is fully covered and a stray block is ignored", () => {
    expect(parseLcovFiles("SF:c.ts\nend_of_record\nTN:")).toEqual([
      { file: "c.ts", lines: 1, functions: 1 },
    ]);
  });
});

describe("evaluatePerFile", () => {
  test("passes when every file meets the floor", () => {
    expect(evaluatePerFile([GOOD], []).passed).toBe(true);
  });

  test("fails a file below the floor and names it", () => {
    const result = evaluatePerFile([GOOD, WEAK], []);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("tools/b.ts");
  });

  test("fails a file under 98% functions alone", () => {
    expect(evaluatePerFile([{ file: "x.ts", lines: 1, functions: 0.97 }], []).passed).toBe(false);
  });

  test("an exception at its floor lets a weak file pass", () => {
    expect(evaluatePerFile([GOOD, WEAK], [EXCEPTION]).passed).toBe(true);
  });

  test("fails an exception for a file with no coverage", () => {
    const result = evaluatePerFile([GOOD], [EXCEPTION]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no coverage");
  });

  test("fails a stale exception", () => {
    const result = evaluatePerFile([GOOD], [{ ...EXCEPTION, file: GOOD.file }]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("stale");
  });

  test("fails an exception with a blank reason", () => {
    const result = evaluatePerFile([WEAK], [{ ...EXCEPTION, reason: "  " }]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no reason");
  });

  test("fails a file under its own exception floor", () => {
    const result = evaluatePerFile([WEAK], [{ ...EXCEPTION, lines: 0.95 }]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("exception floor");
  });
});

function record(file: string, hit: number): string {
  return [`SF:${file}`, "FNF:10", `FNH:${hit}`, "LF:100", `LH:${hit * 10}`, "end_of_record"].join(
    "\n",
  );
}

describe("runCoverageGate per-file enforcement", () => {
  const log = spyOn(console, "log").mockImplementation(() => undefined);
  const error = spyOn(console, "error").mockImplementation(() => undefined);
  const directory = mkdtempSync(path.join(tmpdir(), "coverage-gate-file-"));
  const floorsPath = path.join(directory, "floors.json");
  const lcovPath = path.join(directory, "lcov.info");

  beforeAll(() => {
    writeFileSync(
      floorsPath,
      JSON.stringify({
        tools: { lines: 0.5, functions: 0.5 },
        emet: { lines: 0.5, functions: 0.5 },
      }),
    );
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
    log.mockRestore();
    error.mockRestore();
  });

  test("ignores records outside tools/ and passes when tools/ files meet the floor", () => {
    writeFileSync(lcovPath, [record("tools/a.ts", 10), record("emet/src/x.ts", 1)].join("\n"));
    expect(runCoverageGate(["tools", lcovPath], floorsPath, [])).toBe(0);
  });

  test("fails when a tools/ file is under the per-file floor", () => {
    writeFileSync(lcovPath, [record("tools/a.ts", 10), record("tools/b.ts", 8)].join("\n"));
    expect(runCoverageGate(["tools", lcovPath], floorsPath, [])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("tools/b.ts"));
  });

  test("honours a valid exception and ignores exceptions of other workspaces", () => {
    writeFileSync(lcovPath, [record("tools/a.ts", 10), record("tools/b.ts", 8)].join("\n"));
    const exceptions = [
      { file: "tools/b.ts", reason: "needs a real tty", lines: 0.8, functions: 0.8 },
      { file: "emet/src/gone.ts", reason: "other workspace", lines: 0.1, functions: 0.1 },
    ];
    expect(runCoverageGate(["tools", lcovPath], floorsPath, exceptions)).toBe(0);
  });

  test("fails an exception whose path sits under no workspace root", () => {
    writeFileSync(lcovPath, [record("tools/a.ts", 10)].join("\n"));
    const exceptions = [{ file: "src/typo.ts", reason: "typo", lines: 0.8, functions: 0.8 }];
    expect(runCoverageGate(["tools", lcovPath], floorsPath, exceptions)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("src/typo.ts"));
  });

  test("prefixes workspace-relative paths so exceptions use repository paths", () => {
    writeFileSync(lcovPath, record("src/x.ts", 8));
    const exceptions = [
      { file: "emet/src/x.ts", reason: "native binding", lines: 0.8, functions: 0.8 },
    ];
    expect(runCoverageGate(["emet", lcovPath], floorsPath, exceptions)).toBe(0);
    expect(runCoverageGate(["emet", lcovPath], floorsPath, [])).toBe(1);
  });
});
