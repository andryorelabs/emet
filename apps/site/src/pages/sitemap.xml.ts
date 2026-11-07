import { LOCALES } from "../i18n/locales";
import { absoluteUrl, hreflangAlternates } from "../seo/alternates";
import { buildSitemapXml } from "../seo/crawlers";

/**
 * The sitemap: every locale's home page with its hreflang alternates.
 * @returns The XML response.
 */
export function GET(): Response {
  const entries = LOCALES.map((locale) => ({
    loc: absoluteUrl(locale, "/"),
    alternates: hreflangAlternates("/"),
  }));
  return new Response(buildSitemapXml(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
