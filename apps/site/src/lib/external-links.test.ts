import { describe, expect, test } from "bun:test";

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
