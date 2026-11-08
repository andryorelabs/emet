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

  test("uses the language switcher instead of a link row", () => {
    expect(source).toContain("<LanguageSwitcher");
    expect(source).toContain("currentPath={pagePath}");
    expect(source).toContain("label={strings.languages}");
    expect(source).not.toContain("footer-langs");
  });

  test("derives the page path from Astro.url when none is passed", () => {
    expect(source).toContain("currentPath ?? englishPathOf(Astro.url.pathname, locale)");
  });

  test("splits into a brand, two headed columns and a bottom row", () => {
    expect(source).toContain('class="footer-top"');
    expect(source).toContain('class="footer-brand"');
    expect(source).toContain('class="footer-wordmark"');
    expect(source).toContain("<img src={mark.src}");
    expect(source).toContain('<nav class="footer-column" aria-labelledby={column.id}>');
    expect(source).toContain('id: "footer-product"');
    expect(source).toContain('id: "footer-trust"');
    expect(source).toContain("strings.product");
    expect(source).toContain("strings.trust");
    expect(source).toContain('class="footer-bottom"');
  });

  test("keeps the fine line", () => {
    expect(source).toContain('class="footer-fine"');
  });
});
