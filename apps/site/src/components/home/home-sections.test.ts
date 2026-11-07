import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { findPublishedSourceById, publishedRoute } from "../../docs/published";
import { LOCALES, localePath } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const statsSource = readFileSync(new URL("Stats.astro", import.meta.url), "utf8");
const faqSource = readFileSync(new URL("Faq.astro", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/home.css", import.meta.url), "utf8");

describe("Stats band", () => {
  it("has four items in every locale and reveals each one", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).stats.items).toHaveLength(4);
    }
    expect(statsSource).toContain('data-reveal="item"');
  });

  it("falls to two columns under 600px", () => {
    expect(css).toMatch(
      /@media \(max-width: 600px\) \{\s*\.stats-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });
});

describe("FAQ", () => {
  it("has six rows in every locale", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).faq.items).toHaveLength(6);
    }
    expect(faqSource).toContain("<details");
  });

  it("links More questions to the localized troubleshooting page in every locale", () => {
    const source = findPublishedSourceById("troubleshooting");
    expect(source).toBeDefined();
    expect(faqSource).toContain('localePath(locale, "/docs/troubleshooting/")');
    for (const locale of LOCALES) {
      if (source === undefined) throw new Error("troubleshooting source missing");
      expect(localePath(locale, "/docs/troubleshooting/")).toBe(publishedRoute(source, locale));
    }
  });

  it("transitions the chevron only when motion is allowed", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.faq-chevron \{\s*transition: transform 200ms var\(--ease-out\)/,
    );
    expect(css).not.toMatch(/^\.faq-chevron \{[^}]*transition/m);
  });
});
