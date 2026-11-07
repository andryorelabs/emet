/**
 * The Website's locales as BCP 47 tags, English first.
 */
export const LOCALES = ["en", "es", "de", "fr", "it", "ja", "ko", "pt-BR", "ru", "zh-CN"] as const;

/**
 * One of the Website's locales.
 */
export type Locale = (typeof LOCALES)[number];

/**
 * English is served at the site root; every other locale gets a path prefix.
 */
export const DEFAULT_LOCALE = "en" satisfies Locale;

/**
 * Each locale's name in its own language, shown by the language switcher.
 * Never translated, so a visitor can find their language from any page.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  "pt-BR": "Português (Brasil)",
  ru: "Русский",
  "zh-CN": "简体中文",
};

/**
 * The URL segment of a non-default locale: its tag in lower case (`pt-br`).
 * @param locale - A supported locale.
 * @returns The segment, without slashes.
 */
export function localeSegment(locale: Locale): string {
  return locale.toLowerCase();
}

/**
 * Site-relative path of a page for a locale, with a trailing slash to match
 * `trailingSlash: 'always'`. English is unprefixed; the others are prefixed
 * with their lower-case tag.
 * @param locale - A supported locale.
 * @param path - The page's English path, e.g. `/` or `/docs/guide/`.
 * @returns The path, e.g. `/`, `/pt-br/` or `/es/docs/guide/`.
 */
export function localePath(locale: Locale, path: string): string {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const normalized = withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  return locale === DEFAULT_LOCALE ? normalized : `/${localeSegment(locale)}${normalized}`;
}
