import { describe, expect, test } from "bun:test";
import path from "node:path";

import { externalLinkAttributes, isExternalHref, markExternalLinks } from "./external-links";

const LABEL = "(opens in a new tab)";

describe("isExternalHref", () => {
  test.each([
    "https://github.com/andryorelabs/emet",
    "http://example.com",
    "https://andryore.dev",
    "//github.com/x",
  ])("%s is external", (href) => {
    expect(isExternalHref(href)).toBe(true);
  });

  test.each([
    "/docs/",
    "#install",
    "../guide/fleet/",
    "https://emet.andryore.dev/docs/",
    "mailto:a@b.dev",
    "tel:123",
    "",
  ])("%s is internal", (href) => {
    expect(isExternalHref(href)).toBe(false);
  });
});

describe("externalLinkAttributes", () => {
  test("opens an external link in a new tab", () => {
    expect(externalLinkAttributes("https://github.com/x")).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  test("merges an existing rel", () => {
    expect(externalLinkAttributes("https://andryore.dev", "author")).toEqual({
      target: "_blank",
      rel: "author noopener noreferrer",
    });
  });

  test("leaves an internal link without target", () => {
    expect(externalLinkAttributes("/docs/")).toEqual({});
    expect(externalLinkAttributes("/docs/", "author")).toEqual({ rel: "author" });
  });
});

describe("markExternalLinks", () => {
  test("marks an external anchor", () => {
    expect(markExternalLinks('<p><a href="https://github.com/x">Glossary</a></p>', LABEL)).toBe(
      `<p><a href="https://github.com/x" target="_blank" rel="noopener noreferrer">Glossary<span class="sr-only">${LABEL}</span></a></p>`,
    );
  });

  test("leaves internal anchors unchanged", () => {
    const html = '<a href="/docs/guide/">x</a><a href="#top">y</a>';
    expect(markExternalLinks(html, LABEL)).toBe(html);
  });

  test("merges an existing rel", () => {
    expect(markExternalLinks('<a rel="author" href="https://a.dev">me</a>', LABEL)).toContain(
      'rel="author noopener noreferrer"',
    );
  });

  test("does not touch code text", () => {
    const html = '<code>&lt;a href="https://x.dev"&gt;</code><pre>https://x.dev</pre>';
    expect(markExternalLinks(html, LABEL)).toBe(html);
  });

  test("is idempotent", () => {
    const once = markExternalLinks('<a href="https://x.dev">x</a>', LABEL);
    expect(markExternalLinks(once, LABEL)).toBe(once);
  });
});

const SITE_SOURCE = path.join(import.meta.dir, "..");

async function readSource(relative: string): Promise<string> {
  return Bun.file(path.join(SITE_SOURCE, relative)).text();
}

describe("external links wiring", () => {
  test("the header opens only the GitHub link in a new tab", async () => {
    const header = await readSource("components/site/SiteHeader.astro");
    expect(header).toContain("{...externalLinkAttributes(githubUrl)}");
    expect(header).toContain('<span class="sr-only">{linkStrings.newTab}</span>');
    expect(header).toContain('<a href={docsPath} aria-current={onDocs ? "page" : undefined}>');
    expect(header).toContain(
      '<a href={whatsNewPath} aria-current={onWhatsNew ? "page" : undefined}>',
    );
  });

  test("the mobile menu marks external links from the shared helper", async () => {
    const menu = await readSource("components/site/MobileMenu.astro");
    expect(menu).toContain("{...externalLinkAttributes(link.href)}");
    expect(menu).toContain("isExternalHref(link.href)");
    expect(menu).toContain('<span class="sr-only">{newTab}</span>');
  });

  test("the footer author link keeps the period glued to the link", async () => {
    const footer = await readSource("components/site/SiteFooter.astro");
    expect(footer).toContain('<span class="sr-only">{newTab}</span></a\n      >.');
  });

  test("the docs loader marks external links with the page's own locale", async () => {
    const loader = await readSource("docs/loader.ts");
    expect(loader).toContain("markExternalLinks(");
    expect(loader).toContain("getStrings(locale).links.newTab");
    expect(loader).toContain("renderPage(context, page.body, page.locale)");
  });
});
