import { SITE_ORIGIN, type HreflangAlternate } from "./alternates";

/**
 * One `<url>` of the sitemap.
 */
export interface SitemapEntry {
  loc: string;
  alternates: readonly HreflangAlternate[];
}

/**
 * Escapes the characters XML reserves in text and attributes.
 * @param value - Raw text.
 * @returns The escaped text.
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Renders a sitemap with hreflang alternates on every entry.
 * @param entries - The pages to list.
 * @returns The sitemap XML.
 */
export function buildSitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const links = entry.alternates
      .map(
        ({ hreflang, href }) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}" />`,
      )
      .join("\n");
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${links}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

const SEARCH_AND_ANSWER_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;

const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
] as const;

function group(agents: readonly string[], rule: string): string {
  return `${agents.map((agent) => `User-agent: ${agent}`).join("\n")}\n${rule}\n`;
}

/**
 * Renders `robots.txt`: search and answer crawlers are allowed, model-training
 * crawlers are disallowed in their own group, everyone else is allowed, and
 * the sitemap is listed. `Google-Extended` is not listed: blocking it also
 * removes Gemini grounding and does not affect Search.
 * @returns The robots.txt body.
 */
export function buildRobotsTxt(): string {
  return [
    "# Search and answer crawlers: allowed.",
    group(SEARCH_AND_ANSWER_CRAWLERS, "Allow: /"),
    "# Model-training crawlers: disallowed.",
    group(TRAINING_CRAWLERS, "Disallow: /"),
    group(["*"], "Allow: /"),
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  ].join("\n");
}

/**
 * One docs page listed in `llms.txt`.
 */
export interface LlmsDocsPage {
  id: string;
  seoTitle: string;
  description: string;
}

/**
 * Renders `llms.txt`: the project summary and a link to every docs page.
 * @param summary - One-sentence project description.
 * @param pages - The published docs pages.
 * @returns The llms.txt body.
 */
export function buildLlmsTxt(summary: string, pages: readonly LlmsDocsPage[]): string {
  const docs = pages.map(
    (page) => `- [${page.seoTitle}](${SITE_ORIGIN}/docs/${page.id}/): ${page.description}`,
  );
  return [
    "# emet",
    "",
    `> ${summary}`,
    "",
    "emet is a plugin for Claude Code and Codex. It is not affiliated with or endorsed by Anthropic or OpenAI.",
    "",
    "## Docs",
    "",
    ...docs,
    "",
    "## Links",
    "",
    "- [Source](https://github.com/andryorelabs/emet)",
    `- [Sitemap](${SITE_ORIGIN}/sitemap.xml)`,
    "",
  ].join("\n");
}
