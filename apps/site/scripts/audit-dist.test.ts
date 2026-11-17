import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ALLOWED_ORIGINS, auditDist, main, SITE_ORIGIN, thirdPartyOrigins } from "./audit-dist.ts";

const NO_ALLOW: readonly string[] = [];

describe("thirdPartyOrigins", () => {
  test("returns nothing for a page that only loads its own files", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/_astro/index.css">
      <script type="module" src="/_astro/page.js"></script>
      <link rel="icon" href="favicon.svg">
      </head><body><img src="../hero.webp" srcset="/a.webp 1x, /b.webp 2x"></body></html>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([]);
  });

  test("flags a third-party script, stylesheet, image and frame", () => {
    const html = `<script src="https://cdn.example.com/a.js"></script>
      <link rel=stylesheet href='https://fonts.example.net/b.css'>
      <img src="https://img.example.org/c.png">
      <iframe src="https://embed.example.io/d"></iframe>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([
      "https://cdn.example.com",
      "https://embed.example.io",
      "https://fonts.example.net",
      "https://img.example.org",
    ]);
  });

  test("treats a protocol-relative URL as https", () => {
    expect(thirdPartyOrigins(`<script src="//cdn.example.com/a.js"></script>`, NO_ALLOW)).toEqual([
      "https://cdn.example.com",
    ]);
  });

  test("reads every candidate of a srcset", () => {
    const html = `<picture><source srcset="/a.avif 1x, https://img.example.org/b.avif 2x"></picture>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual(["https://img.example.org"]);
  });

  test("flags preconnect and modulepreload hints", () => {
    const html = `<link rel="preconnect" href="https://a.example.com">
      <link rel="modulepreload" href="https://b.example.com/m.js">`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  test("ignores outbound links, canonical and alternate links", () => {
    const html = `<a href="https://github.com/andryorelabs/emet">GitHub</a>
      <link rel="canonical" href="https://emet.andryore.dev/">
      <link rel="alternate" hreflang="es" href="https://emet.andryore.dev/es/">
      <link rel="sitemap" href="https://other.example.com/sitemap.xml">`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([]);
  });

  test("ignores data, blob and mailto URLs", () => {
    const html = `<img src="data:image/png;base64,AAAA"><img src="blob:abc"><link rel="icon" href="mailto:a@b.c">`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([]);
  });

  test("ignores tags inside comments and script or style bodies", () => {
    const html = `<!-- <script src="https://a.example.com/x.js"></script> -->
      <script>const markup = '<img src="https://b.example.com/y.png">';</script>
      <style>/* <img src="https://c.example.com/z.png"> */</style>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([]);
  });

  test("keeps stripping comments when a removal joins the text around it into a new one", () => {
    const html = `<!<!-- a -->-- <img src="https://nested.example.com/a.png"> -->`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([]);
  });

  test("flags url() in a style element and in a style attribute", () => {
    const html = `<style>@font-face { src: url("https://fonts.example.com/f.woff2") }</style>
      <div style="background: url(https://img.example.com/bg.png)"></div>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([
      "https://fonts.example.com",
      "https://img.example.com",
    ]);
  });

  test("flags an import or fetch of an absolute URL in an inline script", () => {
    const html = `<script type="module">import "https://esm.example.com/x.js"; fetch('https://api.example.com/y');</script>`;
    expect(thirdPartyOrigins(html, NO_ALLOW)).toEqual([
      "https://api.example.com",
      "https://esm.example.com",
    ]);
  });

  test("skips allowed origins and reports each origin once, sorted", () => {
    const html = `<script src="https://z.example.com/a.js"></script>
      <script src="https://z.example.com/b.js"></script>
      <img src="https://emet.andryore.dev/og.png">
      <img src="http://a.example.com/c.png">`;
    expect(thirdPartyOrigins(html, [SITE_ORIGIN])).toEqual([
      "http://a.example.com",
      "https://z.example.com",
    ]);
  });

  test("ignores an attribute that is not a URL", () => {
    expect(thirdPartyOrigins(`<img src="https://">`, NO_ALLOW)).toEqual([]);
  });
});

describe("auditDist and main", () => {
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "audit-dist-"));
    mkdirSync(join(directory, "docs", "guide"), { recursive: true });
    writeFileSync(join(directory, "index.html"), `<script src="/_astro/a.js"></script>`);
    writeFileSync(join(directory, "robots.txt"), "https://cdn.example.com/");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test("passes a dist with no third-party request", () => {
    expect(auditDist(directory, [SITE_ORIGIN])).toEqual([]);
    expect(main([directory], () => undefined)).toBe(0);
  });

  test("names the page and origin of every third-party request", () => {
    writeFileSync(
      join(directory, "docs", "guide", "index.html"),
      `<script src="https://cdn.example.com/tracker.js"></script>`,
    );
    expect(auditDist(directory, [SITE_ORIGIN])).toEqual([
      { file: join("docs", "guide", "index.html"), origin: "https://cdn.example.com" },
    ]);
    const lines: string[] = [];
    expect(main([directory], (line) => lines.push(line))).toBe(1);
    expect(lines).toEqual([
      "docs/guide/index.html: loads https://cdn.example.com",
      "1 third-party origin reference(s) in the built site",
    ]);
  });

  test("allows the docs' GitHub raw images", () => {
    writeFileSync(
      join(directory, "docs", "guide", "index.html"),
      `<img src="https://raw.githubusercontent.com/andryorelabs/emet/main/docs/brand/logo/mark.svg">`,
    );
    expect(auditDist(directory, ALLOWED_ORIGINS)).toEqual([]);
    expect(main([directory], () => undefined)).toBe(0);
  });

  test("fails with a message when the directory does not exist", () => {
    const missing = join(directory, "missing");
    const lines: string[] = [];
    expect(main([missing], (line) => lines.push(line))).toBe(2);
    expect(lines).toEqual([`${missing} does not exist; build the site first`]);
  });

  test("fails with usage when no directory is given", () => {
    const lines: string[] = [];
    expect(main([], (line) => lines.push(line))).toBe(2);
    expect(lines).toEqual(["usage: bun scripts/audit-dist.ts <dist-directory>"]);
  });
});
