import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import { SITE_ORIGIN, absoluteUrl, hreflangAlternates } from "./alternates";
import { buildRobotsTxt, buildSitemapXml } from "./crawlers";

describe("hreflangAlternates", () => {
  test("lists every locale and an x-default pointing at English", () => {
    const alternates = hreflangAlternates("/");
    expect(alternates.map(({ hreflang }) => hreflang)).toEqual([...LOCALES, "x-default"]);
    expect(alternates.find(({ hreflang }) => hreflang === "x-default")?.href).toBe(
      `${SITE_ORIGIN}/`,
    );
    expect(alternates.find(({ hreflang }) => hreflang === "pt-BR")?.href).toBe(
      `${SITE_ORIGIN}/pt-br/`,
    );
  });
});

describe("absoluteUrl", () => {
  test("prefixes non-default locales", () => {
    expect(absoluteUrl("ja", "/")).toBe(`${SITE_ORIGIN}/ja/`);
    expect(absoluteUrl("en", "/")).toBe(`${SITE_ORIGIN}/`);
  });
});

describe("buildSitemapXml", () => {
  test("renders a url with its alternates", () => {
    const xml = buildSitemapXml([
      { loc: absoluteUrl("es", "/"), alternates: hreflangAlternates("/") },
    ]);
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/es/</loc>`);
    expect(xml).toContain('hreflang="zh-CN" href="https://emet.andryore.dev/zh-cn/"');
    expect(xml).toContain('hreflang="x-default"');
  });
});

describe("buildRobotsTxt", () => {
  test("allows crawling and names the sitemap", () => {
    const body = buildRobotsTxt();
    expect(body).toContain("Allow: /");
    expect(body).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });
});
