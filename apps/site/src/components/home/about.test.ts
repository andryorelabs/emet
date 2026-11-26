import { describe, expect, it } from "bun:test";
import { readFileSync, statSync } from "node:fs";

import { LOCALES } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const css = readFileSync(new URL("../../styles/home/about.css", import.meta.url), "utf8");
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
    const pairRule = /^\.hebrew-pair \{[^}]*\}/m.exec(css)?.[0] ?? "";
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
    const block = /@font-face \{[^}]*"Frank Ruhl Libre"[^}]*\}/.exec(tokens)?.[0] ?? "";
    expect(block).toContain("/fonts/FrankRuhlLibre-hebrew.woff2");
    expect(block).toContain("unicode-range: U+05D0, U+05DE, U+05EA;");
  });
});

describe("About portrait", () => {
  it("clips the drift on the portrait picture", () => {
    expect(css).toMatch(/\.portrait picture \{\s*overflow: clip;/);
  });
});
