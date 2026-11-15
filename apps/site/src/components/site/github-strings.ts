import type { Locale } from "../../i18n/locales";

/**
 * The tooltip of the header star count; `{count}` stands for the exact number.
 */
export const GITHUB_STARS_TOOLTIP: Record<Locale, string> = {
  en: "{count} stars",
  es: "{count} estrellas",
  de: "{count} Sterne",
  fr: "{count} étoiles",
  it: "{count} stelle",
  ja: "{count} スター",
  ko: "스타 {count}개",
  "pt-BR": "{count} estrelas",
  ru: "{count} звёзд",
  "zh-CN": "{count} 颗星",
};

/**
 * Fills a tooltip template with the exact star count, grouped per locale.
 */
export function starsTooltip(locale: Locale, count: number): string {
  return GITHUB_STARS_TOOLTIP[locale].replace("{count}", count.toLocaleString(locale));
}
