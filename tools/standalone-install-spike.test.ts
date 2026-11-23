import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_PATH = join(import.meta.dir, "..", "docs", "research", "standalone-install-spike.md");
const CHECK_IDENTIFIERS = ["C1", "C2", "C3", "C4"] as const;

/**
 * Returns the body of the report section whose heading starts with `identifier`.
 */
function sectionBody(report: string, identifier: string): string {
  const sections = report.split(/^## /m);
  const section = sections.find((candidate) => candidate.startsWith(`${identifier}:`));
  if (section === undefined) {
    throw new Error(`section ${identifier} is missing from the spike report`);
  }
  return section;
}

describe("standalone install spike report", () => {
  const report = readFileSync(REPORT_PATH, "utf8");

  test.each(CHECK_IDENTIFIERS)("%s states a result, evidence and a decision", (identifier) => {
    const body = sectionBody(report, identifier);
    expect(body).toMatch(/^Result: (PASS|FAIL|PARTIAL)$/m);
    expect(body).toMatch(/^Decision: \S/m);
    expect(body).toMatch(/^Evidence:$/m);
  });

  test("a failed C1 makes STOP the first line of the report", () => {
    const c1Failed = /^Result: FAIL$/m.test(sectionBody(report, "C1"));
    if (c1Failed) {
      expect(report.split("\n")[0]).toBe("STOP");
    } else {
      expect(report.split("\n")[0]).not.toBe("STOP");
    }
  });
});
