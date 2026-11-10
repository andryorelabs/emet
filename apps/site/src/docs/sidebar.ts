import { LOCALES, type Locale } from "../i18n/locales";

/**
 * Sidebar entry in the shape Starlight's `sidebar` option takes.
 */
export type SidebarEntry =
  | { slug: string }
  | { label: string; translations: Record<string, string>; items: SidebarEntry[] };

const GROUP_LABELS = {
  guide: {
    en: "Guide",
    es: "Guía",
    de: "Anleitung",
    fr: "Guide",
    it: "Guida",
    ja: "ガイド",
    ko: "가이드",
    "pt-BR": "Guia",
    ru: "Руководство",
    "zh-CN": "指南",
  },
  reference: {
    en: "Reference",
    es: "Referencia",
    de: "Referenz",
    fr: "Référence",
    it: "Riferimento",
    ja: "リファレンス",
    ko: "레퍼런스",
    "pt-BR": "Referência",
    ru: "Справочник",
    "zh-CN": "参考",
  },
  howTo: {
    en: "How-to",
    es: "Cómo hacerlo",
    de: "Anleitungen",
    fr: "Pas à pas",
    it: "Procedure",
    ja: "ハウツー",
    ko: "방법",
    "pt-BR": "Como fazer",
    ru: "Как сделать",
    "zh-CN": "操作指南",
  },
} as const satisfies Record<string, Record<Locale, string>>;

function group(
  labels: Record<Locale, string>,
  slugs: readonly string[],
): Extract<SidebarEntry, { items: SidebarEntry[] }> {
  return {
    label: labels.en,
    translations: Object.fromEntries(
      LOCALES.filter((locale) => locale !== "en").map((locale) => [locale, labels[locale]]),
    ),
    items: slugs.map((slug) => ({ slug })),
  };
}

/**
 * Builds Starlight's sidebar: Guide, Reference and How-to groups, then
 * Troubleshooting, Architecture and What's new. Page labels are the pages'
 * own titles in each locale; group labels carry a translation per locale.
 * @returns The sidebar items in display order.
 */
export function buildSidebar(): SidebarEntry[] {
  return [
    group(GROUP_LABELS.guide, [
      "docs/guide/getting-started",
      "docs/guide/fleet",
      "docs/guide/models-and-effort",
      "docs/guide/trackers-and-landing",
      "docs/guide/codex",
    ]),
    group(GROUP_LABELS.reference, [
      "docs/reference/cli",
      "docs/reference/configuration",
      "docs/reference/dependencies",
    ]),
    group(GROUP_LABELS.howTo, ["docs/how-to/update-emet", "docs/how-to/mascot"]),
    { slug: "docs/troubleshooting" },
    { slug: "docs/architecture" },
    { slug: "docs/whats-new" },
  ];
}
