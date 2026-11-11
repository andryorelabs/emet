import { describe, expect, test } from "bun:test";
import { evaluateCoverage, parseLcovTotals } from "./coverage-gate";

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
