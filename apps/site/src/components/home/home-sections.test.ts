import { describe, expect, it } from "bun:test";
import { readFileSync, statSync } from "node:fs";

import { findPublishedSourceById, publishedRoute } from "../../docs/published";
import { LOCALES, localePath } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const statsSource = readFileSync(new URL("Stats.astro", import.meta.url), "utf8");
const faqSource = readFileSync(new URL("Faq.astro", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/home.css", import.meta.url), "utf8");

const aboutSource = readFileSync(new URL("About.astro", import.meta.url), "utf8");
const fontUrl = new URL("../../../public/fonts/FrankRuhlLibre-hebrew.woff2", import.meta.url);

describe("About Hebrew word pair", () => {
  it("marks the pair as right-to-left Hebrew and reveals it as an item", () => {
    expect(aboutSource).toContain('dir="rtl"');
    expect(aboutSource).toContain('lang="he"');
    expect(aboutSource).toMatch(/class="hebrew-pair" data-reveal="item" role="img"/);
  });

  it("has non-empty translated word strings in every locale", () => {
    for (const locale of LOCALES) {
      const { about } = getStrings(locale);
      expect(about.truth.trim().length).toBeGreaterThan(0);
      expect(about.dead.trim().length).toBeGreaterThan(0);
      expect(about.wordLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("fades the aleph only inside a motion guard", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{[^@]*html\[data-motion\] \.hebrew-pair\.is-in \.hebrew-aleph \{\s*color: color-mix\(in oklab, var\(--text\) 25%, transparent\);/,
    );
    expect(css).not.toMatch(/^\.hebrew-pair\.is-in/m);
    expect(css).not.toMatch(/^\.hebrew-aleph \{[^}]*(color|opacity|transition)/m);
  });

  it("draws the strike only inside the motion guard and without blur", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{[^@]*html\[data-motion\] \.hebrew-aleph::after \{/,
    );
    expect(css).not.toMatch(/^\.hebrew-aleph::after/m);
    expect(css).not.toMatch(/\.hebrew-aleph[^{]*\{[^}]*filter:\s*blur/);
  });

  it("aligns the pair with the letter text instead of centring it", () => {
    const pairRule = css.match(/^\.hebrew-pair \{[^}]*\}/m)?.[0] ?? "";
    expect(pairRule).not.toContain("justify-content");
  });

  it("highlights the flag phrase, which every locale provides", () => {
    expect(aboutSource).toContain('class="mark"');
    for (const locale of LOCALES) {
      const { about } = getStrings(locale);
      expect(about.flag.trim().length).toBeGreaterThan(0);
      expect(about.lineTwoBefore.trim().length).toBeGreaterThan(0);
      expect(about.lineTwoAfter.trim().length).toBeGreaterThan(0);
    }
  });

  it("ships a Hebrew subset font under 10 KB", () => {
    expect(statSync(fontUrl).size).toBeLessThan(10 * 1024);
  });

  it("declares the subset font for exactly the three Hebrew code points", () => {
    const tokens = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
    const block = tokens.match(/@font-face \{[^}]*"Frank Ruhl Libre"[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("/fonts/FrankRuhlLibre-hebrew.woff2");
    expect(block).toContain("unicode-range: U+05D0, U+05DE, U+05EA;");
  });
});

const streamsSource = readFileSync(
  new URL("graphics/PaintingStreams.astro", import.meta.url),
  "utf8",
);

describe("How it works painting overlay", () => {
  it("is drawn in master pixels, scaled like the cover-fitted painting, and hidden from assistive tech", () => {
    expect(streamsSource).toContain('viewBox="0 0 1672 941"');
    expect(streamsSource).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(streamsSource).toContain('aria-hidden="true"');
    expect(streamsSource).toContain("{merged}");
  });

  it("has a non-empty Merged label in every locale", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).how.merged.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every ticket pill inside the 360px crop of the master (x 533 to 1139)", () => {
    const heads = [...streamsSource.matchAll(/head: \[(\d+), \d+\]/g)].map((match) =>
      Number(match[1]),
    );
    expect(heads).toHaveLength(3);
    for (const x of heads) {
      expect(x - 48).toBeGreaterThanOrEqual(533);
      expect(x + 48).toBeLessThanOrEqual(1139);
    }
  });
});

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
