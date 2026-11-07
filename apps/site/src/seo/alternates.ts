import { LOCALES, localePath, type Locale } from "../i18n/locales";

/**
 * The Website's origin, without a trailing slash. Matches `site` in
 * `astro.config.ts`.
 */
export const SITE_ORIGIN = "https://emet.andryore.dev";

/**
 * One `<link rel="alternate" hreflang>` target.
 */
export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

/**
 * Absolute URL of a page for a locale.
 * @param locale - A supported locale.
 * @param path - The page's English path, e.g. `/`.
 * @returns The absolute URL with a trailing slash.
 */
export function absoluteUrl(locale: Locale, path: string): string {
  return `${SITE_ORIGIN}${localePath(locale, path)}`;
}

/**
 * The hreflang set of a page: one entry per locale plus `x-default`, which
 * points at English.
 * @param path - The page's English path, e.g. `/`.
 * @returns The alternates, English first, `x-default` last.
 */
export function hreflangAlternates(path: string): HreflangAlternate[] {
  return [
    ...LOCALES.map((locale) => ({ hreflang: locale, href: absoluteUrl(locale, path) })),
    { hreflang: "x-default", href: absoluteUrl("en", path) },
  ];
}
