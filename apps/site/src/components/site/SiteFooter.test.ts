import { describe, expect, test } from "bun:test";
import path from "node:path";

const source = await Bun.file(path.join(import.meta.dir, "SiteFooter.astro")).text();
const expanded = source.replaceAll("${REPOSITORY_URL}", "https://github.com/andryorelabs/emet");

describe("SiteFooter", () => {
  test.each([
    "https://github.com/andryorelabs/emet/actions/workflows/ci.yml",
    "https://www.bestpractices.dev/projects/16352",
    "https://github.com/andryorelabs/emet/blob/main/.github/SECURITY.md",
    "https://github.com/andryorelabs/emet/blob/main/CONTRIBUTING.md",
  ])("links %s", (url) => {
    expect(expanded).toContain(url);
  });

  test("credits the author with rel=author", () => {
    expect(source).toContain('const AUTHOR_URL = "https://github.com/AndryOre"');
    expect(source).toContain('<a href={AUTHOR_URL} rel="author">');
  });

  test("lists every locale with hreflang, lang and aria-current", () => {
    expect(source).toContain("LOCALES.map");
    expect(source).toContain("hreflang={target}");
    expect(source).toContain("lang={target}");
    expect(source).toContain('aria-current={target === locale ? "true" : undefined}');
  });

  test("derives the page path from Astro.url when none is passed", () => {
    expect(source).toContain("currentPath ?? englishPathOf(Astro.url.pathname, locale)");
  });
});
