import { LOCALES, type Locale } from "../i18n/locales";
import { absoluteUrl, hreflangAlternates } from "./alternates";
import type { SitemapEntry } from "./crawlers";
import { docsSources, homeSources, lastModified, type LastModifiedDates } from "./last-modified";

/**
 * The slice of a published docs source the sitemap needs.
 */
export interface SitemapDocsSource {
  id: string;
  sourcePath: string;
}

interface SitemapPage {
  path: string;
  sources: (locale: Locale) => readonly string[];
}

function entry(page: SitemapPage, locale: Locale, dates: LastModifiedDates): SitemapEntry {
  const lastmod = lastModified(page.sources(locale), dates);
  return {
    loc: absoluteUrl(locale, page.path),
    ...(lastmod === undefined ? {} : { lastmod }),
    alternates: hreflangAlternates(page.path),
  };
}

/**
 * Every page the sitemap lists: each locale's home page, then each docs page
 * in each locale, all with their hreflang alternates and, where its sources
 * are dated, a `lastmod`.
 * @param sources - The published docs sources.
 * @param dates - Last commit dates by source path; empty omits every `lastmod`.
 * @returns The sitemap entries.
 */
export function buildSitemapEntries(
  sources: readonly SitemapDocsSource[],
  dates: LastModifiedDates = new Map(),
): SitemapEntry[] {
  const pages: SitemapPage[] = [
    { path: "/", sources: homeSources },
    ...sources.map((source) => ({
      path: `/docs/${source.id}/`,
      sources: (locale: Locale) => docsSources(source, locale),
    })),
  ];
  return pages.flatMap((page) => LOCALES.map((locale) => entry(page, locale, dates)));
}
