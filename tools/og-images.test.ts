import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "../apps/site/src/i18n/locales.ts";
import { readPngSize } from "./brand-export-spec.ts";
import { OG_HEIGHT, OG_WIDTH, buildOgHtml, ogCopy } from "./og-images.ts";

const PUBLIC_DIRECTORY = join(import.meta.dir, "..", "apps", "site", "public");

describe("ogCopy", () => {
  test("drops the product name from every locale's tagline", () => {
    for (const locale of LOCALES) {
      const { tagline } = ogCopy(locale);
      expect(tagline.length).toBeGreaterThan(0);
      expect(tagline).not.toMatch(/^emet/);
    }
  });
});

describe("buildOgHtml", () => {
  test("sets the language and escapes the copy", () => {
    const html = buildOgHtml(
      { locale: "ja", tagline: "A <b> & B", description: "d" },
      "<svg></svg>",
      "file:///font.woff2",
    );
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("A &lt;b&gt; &amp; B");
    expect(html).toContain(`width: ${OG_WIDTH}px`);
  });
});

describe("committed share images", () => {
  test("every locale has a 1200x630 PNG", () => {
    for (const locale of LOCALES) {
      const png = readFileSync(join(PUBLIC_DIRECTORY, "og", `og-${locale}.png`));
      expect(readPngSize(png)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
    }
  });

  test("the install icons have their sizes", () => {
    const sizes = [
      ["apple-touch-icon.png", 180],
      ["icons/icon-192.png", 192],
      ["icons/icon-512.png", 512],
    ] as const;
    for (const [path, size] of sizes) {
      const png = readFileSync(join(PUBLIC_DIRECTORY, path));
      expect(readPngSize(png)).toEqual({ width: size, height: size });
    }
  });
});
