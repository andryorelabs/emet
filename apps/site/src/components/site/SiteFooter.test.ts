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
    expect(source).toContain('const AUTHOR_URL = "https://andryore.dev"');
    expect(source).toContain('externalLinkAttributes(AUTHOR_URL, "author")');
  });

  test("opens external links in a new tab with a hidden label", () => {
    expect(source).toContain("externalLinkAttributes(link.href)");
    expect(source).toContain('<span class="sr-only">{newTab}</span>');
  });

  test("has no language switcher", () => {
    expect(source).not.toContain("LanguageSwitcher");
    expect(source).not.toContain("strings.languages");
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

  test("puts the three legal items in one bottom row", () => {
    expect(source).toContain('<Separator className="mt-10" />');
    expect(source).toContain("{strings.legal} {strings.notice}");
    expect(source).toContain("<span>{strings.paintings}</span>");
    expect(source).toContain("{strings.builtBy}");
  });

  test("groups both columns in one block", () => {
    expect(source).toContain('class="footer-columns"');
    expect(source).toContain('buttonVariants({ variant: "link" })');
  });
});
