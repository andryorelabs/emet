import { LOCALES, type Locale } from "../i18n/locales";

/**
 * Sidebar entry in the shape Starlight's `sidebar` option takes.
 */
export type SidebarEntry =
  | { slug: string }
  | { label: string; translations: Record<string, string>; items: SidebarEntry[] };

const GROUP_LABELS = {
  start: {
    en: "Get started",
    es: "Primeros pasos",
    de: "Erste Schritte",
    fr: "Démarrer",
    it: "Per iniziare",
    ja: "はじめに",
    ko: "시작하기",
    "pt-BR": "Primeiros passos",
    ru: "Начало работы",
    "zh-CN": "快速开始",
  },
  concepts: {
    en: "Concepts",
    es: "Conceptos",
    de: "Konzepte",
    fr: "Concepts",
    it: "Concetti",
    ja: "コンセプト",
    ko: "개념",
    "pt-BR": "Conceitos",
    ru: "Концепции",
    "zh-CN": "概念",
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
  help: {
    en: "Help",
    es: "Ayuda",
    de: "Hilfe",
    fr: "Aide",
    it: "Aiuto",
    ja: "ヘルプ",
    ko: "도움말",
    "pt-BR": "Ajuda",
    ru: "Помощь",
    "zh-CN": "帮助",
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
 * Builds Starlight's sidebar: five fixed groups, Get started, Concepts,
 * How-to, Reference and Help. Page labels are the pages' own titles in each
 * locale; group labels carry a translation per locale.
 * @returns The sidebar items in display order.
 */
export function buildSidebar(): SidebarEntry[] {
  return [
    group(GROUP_LABELS.start, [
      "docs/start/overview",
      "docs/start/install",
      "docs/start/first-run",
    ]),
    group(GROUP_LABELS.concepts, [
      "docs/concepts/runs-waves-specs",
      "docs/concepts/landing",
      "docs/concepts/review-and-gates",
      "docs/concepts/memory",
      "docs/concepts/attention-and-journal",
      "docs/concepts/living-specs",
      "docs/concepts/security",
      "docs/concepts/architecture",
    ]),
    group(GROUP_LABELS.howTo, [
      "docs/how-to/use-codex",
      "docs/how-to/check-a-fleet",
      "docs/how-to/configure-tracker",
      "docs/how-to/choose-models",
      "docs/how-to/mascot",
    ]),
    group(GROUP_LABELS.reference, [
      "docs/reference/cli",
      "docs/reference/configuration",
      "docs/reference/dependencies",
      "docs/reference/stability",
    ]),
    group(GROUP_LABELS.help, ["docs/troubleshooting", "docs/whats-new"]),
  ];
}
