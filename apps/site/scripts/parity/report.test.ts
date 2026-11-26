import { describe, expect, test } from "bun:test";

import { FLAG_THRESHOLD, buildReport, summaryLine } from "./report";

describe("buildReport", () => {
  test("is empty for no pairs", () => {
    const report = buildReport([]);
    expect(report).toEqual({ pairs: [], mean: 0, worst: undefined, flagged: [] });
    expect(summaryLine(report)).toBe("parity: 0 pairs, mean 0.0%, 0 flagged, worst none");
  });

  test("computes mean, worst and flagged pairs", () => {
    const low = { section: "hero", progress: 0, ratio: 0 };
    const high = { section: "faq", progress: 0.5, ratio: FLAG_THRESHOLD + 0.2 };
    const report = buildReport([low, high]);
    expect(report.mean).toBeCloseTo((FLAG_THRESHOLD + 0.2) / 2);
    expect(report.worst).toBe(high);
    expect(report.flagged).toEqual([high]);
    expect(summaryLine(report)).toBe("parity: 2 pairs, mean 12.5%, 1 flagged, worst faq@50 25.0%");
  });
});
