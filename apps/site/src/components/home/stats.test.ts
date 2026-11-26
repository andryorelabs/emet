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

  it("carries a topographic canvas and a count on the numeric items only", () => {
    expect(statsSource).toContain("<canvas");
    expect(statsSource).toContain("data-topo");
    expect(statsSource).toContain("data-n=");
    expect(statsSource).toContain("/^\\d+$/");
    expect(statsSource).toContain("stat-text");
    expect(statsSource).toContain('from "./stats"');
  });

  it("is a night band built from tokens, with no colour literals or inline styles", () => {
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("var(--moss)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i);
    expect(statsSource).not.toContain("style=");
  });

  it("shows the final state under reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*transition: none/);
    expect(css).toMatch(/\.stat::before \{[^}]*width: 62%/);
  });

  it("falls to two columns under 600px", () => {
    expect(css).toMatch(
      /@media \(max-width: 600px\) \{\s*\.stats-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });
});
