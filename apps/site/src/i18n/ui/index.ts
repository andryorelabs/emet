import type { Locale } from "../locales";
import { de } from "./de";
import { en, type UiStrings } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { ptBR } from "./pt-BR";
import { ru } from "./ru";
import { zhCN } from "./zh-CN";

const STRINGS_BY_LOCALE: Record<Locale, UiStrings> = {
  en,
  es,
  de,
  fr,
  it,
  ja,
  ko,
  "pt-BR": ptBR,
  ru,
  "zh-CN": zhCN,
};

/**
 * The home page strings of a locale.
 * @param locale - A supported locale.
 * @returns The locale's strings, matching the English source.
 */
export function getStrings(locale: Locale): UiStrings {
  return STRINGS_BY_LOCALE[locale];
}
