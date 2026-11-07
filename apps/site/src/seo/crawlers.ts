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

/**
 * Renders `robots.txt`: everything is crawlable and the sitemap is listed.
 * @returns The robots.txt body.
 */
export function buildRobotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}
