import { PUBLISHED_SOURCES } from "../docs/published";
import { buildSitemapXml } from "../seo/crawlers";
import { parseLastModifiedDates } from "../seo/last-modified";
import { buildSitemapEntries } from "../seo/sitemap-entries";

/**
 * The only sitemap: every locale's home page and every docs page, each with
 * its hreflang alternates and, when the build was given
 * `LAST_MODIFIED_DATES` (see `docker/last-modified.sh`), its `lastmod`.
 * @returns The XML response.
 */
export function GET(): Response {
  const dates = parseLastModifiedDates(process.env.LAST_MODIFIED_DATES);
  return new Response(buildSitemapXml(buildSitemapEntries(PUBLISHED_SOURCES, dates)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
