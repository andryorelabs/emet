import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

function sheet(name: string): string {
  return readFileSync(new URL(`../../../styles/${name}`, import.meta.url), "utf8");
}

const tokens = sheet("tokens.css");
const LITERAL = /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|hsla?\(/;

describe("colour tokens for the closing pill, hero glass and about mark", () => {
  it("keeps colour literals out of closing.css and about.css", () => {
    expect(LITERAL.test(sheet("home/closing.css"))).toBe(false);
    expect(LITERAL.test(sheet("home/about.css"))).toBe(false);
  });

  it("keeps the announcement and bubble fills on tokens", () => {
    const hero = sheet("home/hero.css");
    for (const token of [
      "glass-line",
      "glass-fill",
      "glass-fill-hover",
      "bubble-fill",
      "bubble-text",
    ]) {
      expect(hero).toContain(`var(--${token})`);
      expect(tokens).toContain(`--${token}:`);
    }
  });

  it("defines every closing token in tokens.css", () => {
    for (const token of ["painting-ink", "pill-fill", "pill-text", "pill-line"]) {
      expect(tokens).toContain(`--${token}:`);
    }
  });

  it("derives the mark highlight from the scheme-aware lamp token", () => {
    expect(sheet("home/about.css")).toContain("color-mix(in oklab, var(--lamp) 55%, transparent)");
  });
});
