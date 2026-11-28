import { describe, expect, test } from "bun:test";
import path from "node:path";

const source = await Bun.file(path.join(import.meta.dir, "SiteFooter.astro")).text();
const siteCss = await Bun.file(path.join(import.meta.dir, "../../styles/site.css")).text();
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
  });

  test("sets the column links as plain anchors, as prototype v17 does", () => {
    expect(source).not.toContain("buttonVariants");
    expect(source).toContain('<a class="footer-link" href={link.href}');
  });
});

/** The body of the first top-level `site.css` rule for exactly `selector`, with the formatter's line wrapping undone. */
function rule(selector: string): string {
  const start = siteCss.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return siteCss
    .slice(start, siteCss.indexOf("}", start))
    .replaceAll(/\s+/g, " ")
    .replaceAll("( ", "(")
    .replaceAll(" )", ")");
}

describe("site footer styles", () => {
  test("spans the full width with its top border and insets its content like the prototype's .inner", () => {
    const footer = rule(".site-footer");
    expect(footer).not.toContain("margin-inline");
    expect(footer).toContain("padding: 48px 0 32px;");
    expect(footer).toContain(
      "padding-inline: max(calc(2 * var(--footer-pad)), calc((100% - var(--footer-inner)) / 2 + var(--footer-pad)));",
    );
    expect(footer).toContain("border-top: 1px solid var(--border);");
  });

  test("keeps the docs footer flush with the content column, with a single border", () => {
    expect(rule(".docs-site-footer .site-footer")).toContain("padding-inline: 0;");
  });

  test("sizes the docs wordmark by the content column so it never runs under the table of contents", () => {
    expect(rule(".docs-site-footer")).toContain("container-type: inline-size;");
    expect(rule(".docs-site-footer .footer-wordmark")).toContain(
      "font-size: min(120px, calc(100cqi / 3.2));",
    );
  });

  test("caps the wordmark below the prototype's 120px floor so it never scrolls a phone sideways", () => {
    expect(rule(".footer-wordmark")).toContain(
      "font-size: min(clamp(120px, 19vw, 260px), calc((100vw - 64px) / 3.2));",
    );
  });

  test("sets headings and links at line-height normal so rows match the prototype", () => {
    expect(rule(".site-footer .footer-heading")).toContain("line-height: normal;");
    expect(rule(".footer-column a.footer-link")).toContain("line-height: normal;");
  });
});
