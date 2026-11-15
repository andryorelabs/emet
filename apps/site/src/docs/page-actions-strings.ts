import type { Locale } from "../i18n/locales";

/**
 * Every label of the docs title row's Copy Page button, its menu and the
 * previous/next buttons.
 */
export interface PageActionsStrings {
  copyPage: string;
  copied: string;
  copyFailed: string;
  moreActions: string;
  viewAsMarkdown: string;
  openInChatGpt: string;
  openInClaude: string;
  previousPage: string;
  nextPage: string;
}

/**
 * The page actions labels of each locale.
 */
export const PAGE_ACTIONS_STRINGS: Record<Locale, PageActionsStrings> = {
  en: {
    copyPage: "Copy Page",
    copied: "Copied",
    copyFailed: "Copy failed",
    moreActions: "More page actions",
    viewAsMarkdown: "View as Markdown",
    openInChatGpt: "Open in ChatGPT",
    openInClaude: "Open in Claude",
    previousPage: "Previous page",
    nextPage: "Next page",
  },
  es: {
    copyPage: "Copiar página",
    copied: "Copiado",
    copyFailed: "No se pudo copiar",
    moreActions: "Más acciones de la página",
    viewAsMarkdown: "Ver como Markdown",
    openInChatGpt: "Abrir en ChatGPT",
    openInClaude: "Abrir en Claude",
    previousPage: "Página anterior",
    nextPage: "Página siguiente",
  },
  de: {
    copyPage: "Seite kopieren",
    copied: "Kopiert",
    copyFailed: "Kopieren fehlgeschlagen",
    moreActions: "Weitere Seitenaktionen",
    viewAsMarkdown: "Als Markdown ansehen",
    openInChatGpt: "In ChatGPT öffnen",
    openInClaude: "In Claude öffnen",
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
  },
  fr: {
    copyPage: "Copier la page",
    copied: "Copié",
    copyFailed: "Échec de la copie",
    moreActions: "Plus d'actions pour la page",
    viewAsMarkdown: "Voir en Markdown",
    openInChatGpt: "Ouvrir dans ChatGPT",
    openInClaude: "Ouvrir dans Claude",
    previousPage: "Page précédente",
    nextPage: "Page suivante",
  },
  it: {
    copyPage: "Copia pagina",
    copied: "Copiato",
    copyFailed: "Copia non riuscita",
    moreActions: "Altre azioni della pagina",
    viewAsMarkdown: "Visualizza come Markdown",
    openInChatGpt: "Apri in ChatGPT",
    openInClaude: "Apri in Claude",
    previousPage: "Pagina precedente",
    nextPage: "Pagina successiva",
  },
  ja: {
    copyPage: "ページをコピー",
    copied: "コピーしました",
    copyFailed: "コピーに失敗しました",
    moreActions: "その他のページ操作",
    viewAsMarkdown: "Markdown で表示",
    openInChatGpt: "ChatGPT で開く",
    openInClaude: "Claude で開く",
    previousPage: "前のページ",
    nextPage: "次のページ",
  },
  ko: {
    copyPage: "페이지 복사",
    copied: "복사됨",
    copyFailed: "복사 실패",
    moreActions: "더 많은 페이지 작업",
    viewAsMarkdown: "Markdown으로 보기",
    openInChatGpt: "ChatGPT에서 열기",
    openInClaude: "Claude에서 열기",
    previousPage: "이전 페이지",
    nextPage: "다음 페이지",
  },
  "pt-BR": {
    copyPage: "Copiar página",
    copied: "Copiado",
    copyFailed: "Falha ao copiar",
    moreActions: "Mais ações da página",
    viewAsMarkdown: "Ver como Markdown",
    openInChatGpt: "Abrir no ChatGPT",
    openInClaude: "Abrir no Claude",
    previousPage: "Página anterior",
    nextPage: "Próxima página",
  },
  ru: {
    copyPage: "Копировать страницу",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать",
    moreActions: "Другие действия со страницей",
    viewAsMarkdown: "Открыть как Markdown",
    openInChatGpt: "Открыть в ChatGPT",
    openInClaude: "Открыть в Claude",
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
  },
  "zh-CN": {
    copyPage: "复制页面",
    copied: "已复制",
    copyFailed: "复制失败",
    moreActions: "更多页面操作",
    viewAsMarkdown: "以 Markdown 查看",
    openInChatGpt: "在 ChatGPT 中打开",
    openInClaude: "在 Claude 中打开",
    previousPage: "上一页",
    nextPage: "下一页",
  },
};
