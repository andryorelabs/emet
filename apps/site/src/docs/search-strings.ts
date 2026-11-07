import type { Locale } from "../i18n/locales";

/**
 * The placeholder Pagefind replaces with the visitor's query in its messages.
 */
export const SEARCH_TERM_TOKEN = "[SEARCH_TERM]";

/**
 * Every string of the docs search dialog and of the code copy button.
 */
export interface SearchStrings {
  placeholder: string;
  searching: string;
  noResults: (query: string) => string;
  footerPrivacy: string;
  footerKeys: string;
  escapeKey: string;
  copy: string;
  copied: string;
}

/**
 * The docs search dialog and copy button strings of each locale.
 */
export const SEARCH_STRINGS: Record<Locale, SearchStrings> = {
  en: {
    placeholder: "Search the docs",
    searching: "Searching…",
    noResults: (query) => `Nothing matches “${query}”. Try fewer words.`,
    footerPrivacy: "Search runs in your browser. Nothing leaves this site.",
    footerKeys: "↑↓ to move, Enter to open",
    escapeKey: "Esc",
    copy: "Copy",
    copied: "Copied",
  },
  es: {
    placeholder: "Buscar en la documentación",
    searching: "Buscando…",
    noResults: (query) => `Nada coincide con “${query}”. Prueba con menos palabras.`,
    footerPrivacy: "La búsqueda se ejecuta en tu navegador. Nada sale de este sitio.",
    footerKeys: "↑↓ para moverte, Enter para abrir",
    escapeKey: "Esc",
    copy: "Copiar",
    copied: "Copiado",
  },
  de: {
    placeholder: "In der Dokumentation suchen",
    searching: "Suche läuft…",
    noResults: (query) => `Nichts passt zu „${query}“. Versuche es mit weniger Wörtern.`,
    footerPrivacy: "Die Suche läuft in deinem Browser. Nichts verlässt diese Website.",
    footerKeys: "↑↓ zum Navigieren, Enter zum Öffnen",
    escapeKey: "Esc",
    copy: "Kopieren",
    copied: "Kopiert",
  },
  fr: {
    placeholder: "Rechercher dans la documentation",
    searching: "Recherche…",
    noResults: (query) => `Rien ne correspond à « ${query} ». Essayez avec moins de mots.`,
    footerPrivacy: "La recherche s’exécute dans votre navigateur. Rien ne quitte ce site.",
    footerKeys: "↑↓ pour naviguer, Entrée pour ouvrir",
    escapeKey: "Échap",
    copy: "Copier",
    copied: "Copié",
  },
  it: {
    placeholder: "Cerca nella documentazione",
    searching: "Ricerca in corso…",
    noResults: (query) => `Nessun risultato per “${query}”. Prova con meno parole.`,
    footerPrivacy: "La ricerca viene eseguita nel tuo browser. Niente lascia questo sito.",
    footerKeys: "↑↓ per spostarti, Invio per aprire",
    escapeKey: "Esc",
    copy: "Copia",
    copied: "Copiato",
  },
  ja: {
    placeholder: "ドキュメントを検索",
    searching: "検索中…",
    noResults: (query) => `「${query}」に一致するものはありません。語数を減らしてみてください。`,
    footerPrivacy: "検索はブラウザー内で実行されます。このサイトの外には何も送信されません。",
    footerKeys: "↑↓ で移動、Enter で開く",
    escapeKey: "Esc",
    copy: "コピー",
    copied: "コピーしました",
  },
  ko: {
    placeholder: "문서 검색",
    searching: "검색 중…",
    noResults: (query) => `“${query}”와(과) 일치하는 항목이 없습니다. 단어 수를 줄여 보세요.`,
    footerPrivacy: "검색은 브라우저에서 실행됩니다. 이 사이트 밖으로 아무것도 전송되지 않습니다.",
    footerKeys: "↑↓로 이동, Enter로 열기",
    escapeKey: "Esc",
    copy: "복사",
    copied: "복사됨",
  },
  "pt-BR": {
    placeholder: "Pesquisar na documentação",
    searching: "Pesquisando…",
    noResults: (query) => `Nada corresponde a “${query}”. Tente menos palavras.`,
    footerPrivacy: "A pesquisa roda no seu navegador. Nada sai deste site.",
    footerKeys: "↑↓ para mover, Enter para abrir",
    escapeKey: "Esc",
    copy: "Copiar",
    copied: "Copiado",
  },
  ru: {
    placeholder: "Поиск по документации",
    searching: "Идёт поиск…",
    noResults: (query) => `Ничего не найдено по запросу «${query}». Попробуйте меньше слов.`,
    footerPrivacy: "Поиск выполняется в вашем браузере. Ничто не покидает этот сайт.",
    footerKeys: "↑↓ для перемещения, Enter для открытия",
    escapeKey: "Esc",
    copy: "Копировать",
    copied: "Скопировано",
  },
  "zh-CN": {
    placeholder: "搜索文档",
    searching: "正在搜索…",
    noResults: (query) => `没有与“${query}”匹配的内容。请尝试更少的词。`,
    footerPrivacy: "搜索在你的浏览器中运行。没有任何内容会离开本站。",
    footerKeys: "↑↓ 移动，Enter 打开",
    escapeKey: "Esc",
    copy: "复制",
    copied: "已复制",
  },
};
