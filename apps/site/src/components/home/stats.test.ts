import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { LOCALES } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const statsSource = readFileSync(new URL("Stats.astro", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/home/stats.css", import.meta.url), "utf8");

describe("Stats band", () => {
  it("has four items in every locale and reveals each one", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).stats.items).toHaveLength(4);
    }
    expect(statsSource).toContain('data-reveal="item"');
  });

  it("has a non-empty detail for every item in every locale", () => {
    for (const locale of LOCALES) {
      for (const item of getStrings(locale).stats.items) {
        expect(item.detail.trim().length).toBeGreaterThan(0);
      }
    }
    expect(statsSource).toContain("stat-detail");
  });

  it("falls to two columns under 600px", () => {
    expect(css).toMatch(
      /@media \(max-width: 600px\) \{\s*\.stats-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });
});
