import { describe, expect, test } from "bun:test";

import { FLAG_THRESHOLD, buildReport, summaryLine } from "./report";

describe("buildReport", () => {
  test("is empty for no pairs", () => {
    const report = buildReport([]);
    expect(report).toEqual({ pairs: [], missing: [], mean: 0, worst: undefined, flagged: [] });
    expect(summaryLine(report)).toBe(
      "parity: 0 pairs, 0 missing, mean 0.0%, 0 flagged, worst none",
    );
  });

  test("computes mean, worst and flagged pairs", () => {
    const low = { variant: "desktop-light-motion", section: "hero", progress: 0, ratio: 0 };
    const high = {
      variant: "mobile-dark-reduced",
      section: "faq",
      progress: 0.5,
      ratio: FLAG_THRESHOLD + 0.2,
    };
    const report = buildReport([low, high]);
    expect(report.mean).toBeCloseTo((FLAG_THRESHOLD + 0.2) / 2);
    expect(report.worst).toBe(high);
    expect(report.flagged).toEqual([high]);
    expect(summaryLine(report)).toBe(
      "parity: 2 pairs, 0 missing, mean 12.5%, 1 flagged, worst mobile-dark-reduced/faq@50 25.0%",
    );
  });

  test("lists and counts captures missing on one side", () => {
    const gap = {
      variant: "desktop-light-motion",
      section: "stats",
      progress: 1,
      missing: "site" as const,
    };
    const report = buildReport([], [gap]);
    expect(report.missing).toEqual([gap]);
    expect(summaryLine(report)).toBe(
      "parity: 0 pairs, 1 missing, mean 0.0%, 0 flagged, worst none",
    );
  });
});
