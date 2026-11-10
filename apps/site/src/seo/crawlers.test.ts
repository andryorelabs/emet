import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import { SITE_ORIGIN, absoluteUrl, hreflangAlternates } from "./alternates";
import { buildLlmsTxt, buildRobotsTxt, buildSitemapXml } from "./crawlers";

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
  test("allows everyone else and names the sitemap", () => {
    const body = buildRobotsTxt();
    expect(body).toContain("User-agent: *\nAllow: /\n");
    expect(body).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  test("disallows AI-training crawlers and allows search crawlers", () => {
    const body = buildRobotsTxt();
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: ClaudeBot");
    expect(body).toMatch(/User-agent: Bytespider\nDisallow: \/\n/);
    expect(body).toMatch(/User-agent: Googlebot[\s\S]*?Allow: \//);
    expect(body).toMatch(/User-agent: GPTBot\n(?:User-agent: [^\n]+\n)*Disallow: \/\n/);
  });
});

describe("buildLlmsTxt", () => {
  test("links every docs page", () => {
    const body = buildLlmsTxt("A summary.", [
      { id: "guide/fleet", seoTitle: "Fleet Check", description: "Audit repos." },
    ]);
    expect(body).toContain("> A summary.");
    expect(body).toContain(`- [Fleet Check](${SITE_ORIGIN}/docs/guide/fleet/): Audit repos.`);
  });

  test("names both Agent hosts", () => {
    const body = buildLlmsTxt("A summary.", []);
    expect(body).toContain("emet is a plugin for Claude Code and Codex.");
  });

  test("names both vendors in the notice", () => {
    const body = buildLlmsTxt("A summary.", []);
    expect(body).toContain("endorsed by Anthropic or OpenAI.");
  });
});
