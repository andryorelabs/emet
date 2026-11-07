import { PUBLISHED_SOURCES } from "../docs/published";
import { buildSitemapXml } from "../seo/crawlers";
import { buildSitemapEntries } from "../seo/sitemap-entries";

/**
 * The only sitemap: every locale's home page and every docs page, each with
 * its hreflang alternates.
 * @returns The XML response.
 */
export function GET(): Response {
  return new Response(buildSitemapXml(buildSitemapEntries(PUBLISHED_SOURCES)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
