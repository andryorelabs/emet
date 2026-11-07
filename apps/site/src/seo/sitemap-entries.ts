import { LOCALES } from "../i18n/locales";
import { absoluteUrl, hreflangAlternates } from "./alternates";
import type { SitemapEntry } from "./crawlers";

/**
 * The slice of a published docs source the sitemap needs.
 */
export interface SitemapDocsSource {
  id: string;
}

/**
 * Every page the sitemap lists: each locale's home page, then each docs page
 * in each locale, all with their hreflang alternates.
 * @param sources - The published docs sources.
 * @returns The sitemap entries.
 */
export function buildSitemapEntries(sources: readonly SitemapDocsSource[]): SitemapEntry[] {
  const paths = ["/", ...sources.map((source) => `/docs/${source.id}/`)];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      loc: absoluteUrl(locale, path),
      alternates: hreflangAlternates(path),
    })),
  );
}
