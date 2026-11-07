import { DEFAULT_LOCALE, LOCALES, type Locale, localeSegment } from "../i18n/locales";

/**
 * Resolves the locale of a Starlight route from its language tag.
 * @param lang - The route's BCP 47 language tag.
 * @returns The matching Website locale, or English when none matches.
 */
export function resolveLocale(lang: string): Locale {
  return LOCALES.find((locale) => locale.toLowerCase() === lang.toLowerCase()) ?? DEFAULT_LOCALE;
}

/**
 * Strips a locale prefix from a site path, giving the English path the
 * language switcher needs.
 * @param pathname - The page's path, e.g. `/es/docs/guide/fleet/`.
 * @param locale - The locale the page is served in.
 * @returns The path without its locale prefix, e.g. `/docs/guide/fleet/`.
 */
export function englishPathOf(pathname: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return pathname;
  const prefix = `/${localeSegment(locale)}/`;
  return pathname.startsWith(prefix) ? `/${pathname.slice(prefix.length)}` : pathname;
}
