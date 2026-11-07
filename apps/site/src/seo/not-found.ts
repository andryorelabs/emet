import type { Locale } from "../i18n/locales";

/**
 * The words of a 404 page: the title, the sentence under it and the labels of
 * its two links.
 */
export interface NotFoundStrings {
  title: string;
  text: string;
  homeAction: string;
  docsAction: string;
}

/**
 * 404 copy per locale. English is the run notes' deck; the others are AI
 * translations, not human reviewed.
 */
export const NOT_FOUND_STRINGS: Record<Locale, NotFoundStrings> = {
  en: {
    title: "This page wandered off.",
    text: "That address does not exist, or the page moved. Start from the home page or the docs.",
    homeAction: "Home page",
    docsAction: "Docs",
  },
  es: {
    title: "Esta página se ha perdido.",
    text: "Esa dirección no existe o la página se movió. Empieza por la página de inicio o la documentación.",
    homeAction: "Inicio",
    docsAction: "Documentación",
  },
  de: {
    title: "Diese Seite ist davongewandert.",
    text: "Diese Adresse existiert nicht, oder die Seite wurde verschoben. Beginne auf der Startseite oder in der Doku.",
    homeAction: "Startseite",
    docsAction: "Doku",
  },
  fr: {
    title: "Cette page s'est égarée.",
    text: "Cette adresse n'existe pas, ou la page a été déplacée. Repartez de l'accueil ou de la documentation.",
    homeAction: "Accueil",
    docsAction: "Docs",
  },
  it: {
    title: "Questa pagina si è smarrita.",
    text: "Questo indirizzo non esiste, oppure la pagina è stata spostata. Riparti dalla home o dalla documentazione.",
    homeAction: "Home",
    docsAction: "Documentazione",
  },
  ja: {
    title: "このページは迷子になりました。",
    text: "そのアドレスは存在しないか、ページが移動しました。ホームかドキュメントから始めてください。",
    homeAction: "ホーム",
    docsAction: "ドキュメント",
  },
  ko: {
    title: "이 페이지는 길을 잃었습니다.",
    text: "해당 주소가 없거나 페이지가 이동했습니다. 홈 또는 문서에서 시작해 보세요.",
    homeAction: "홈",
    docsAction: "문서",
  },
  "pt-BR": {
    title: "Esta página se perdeu.",
    text: "Esse endereço não existe ou a página mudou de lugar. Comece pela página inicial ou pela documentação.",
    homeAction: "Página inicial",
    docsAction: "Documentação",
  },
  ru: {
    title: "Эта страница куда-то пропала.",
    text: "Такого адреса нет, или страница переехала. Начните с главной страницы или с документации.",
    homeAction: "Главная",
    docsAction: "Документация",
  },
  "zh-CN": {
    title: "这个页面走丢了。",
    text: "这个地址不存在，或页面已被移动。请从首页或文档开始。",
    homeAction: "首页",
    docsAction: "文档",
  },
};
