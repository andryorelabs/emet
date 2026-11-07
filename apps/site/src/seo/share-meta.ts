import { DEFAULT_LOCALE, LOCALES, localeSegment, type Locale } from "../i18n/locales";
import { getStrings } from "../i18n/ui";
import { SITE_ORIGIN, absoluteUrl } from "./alternates";

/**
 * One head element, in the shape Astro and Starlight both accept.
 */
export interface Tag {
  tag: "meta" | "link" | "script";
  attrs: Record<string, string>;
  content?: string;
}

/**
 * The Open Graph locale of each Website locale (`language_TERRITORY`).
 */
const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
  de: "de_DE",
  fr: "fr_FR",
  it: "it_IT",
  ja: "ja_JP",
  ko: "ko_KR",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  "zh-CN": "zh_CN",
};

/**
 * Width of the share images, in pixels.
 */
const OG_IMAGE_WIDTH = 1200;

/**
 * Height of the share images, in pixels.
 */
const OG_IMAGE_HEIGHT = 630;

/**
 * Site-relative path of a locale's share image.
 * @param locale - A supported locale.
 * @returns The path, e.g. `/og/og-ja.png`.
 */
export function ogImagePath(locale: Locale): string {
  return `/og/og-${locale}.png`;
}

function meta(key: "property" | "name", name: string, content: string): Tag {
  return { tag: "meta", attrs: { [key]: name, content } };
}

/**
 * The Open Graph and Twitter tags of one page.
 * @param locale - The page's locale.
 * @param path - The page's English path, e.g. `/` or `/docs/guide/`.
 * @param title - The page title.
 * @param description - The page description.
 * @returns The meta tags, in head order.
 */
export function shareMetaTags(
  locale: Locale,
  path: string,
  title: string,
  description: string,
): Tag[] {
  const image = `${SITE_ORIGIN}${ogImagePath(locale)}`;
  const alternates = LOCALES.filter((other) => other !== locale).map((other) =>
    meta("property", "og:locale:alternate", OPEN_GRAPH_LOCALES[other]),
  );
  return [
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", absoluteUrl(locale, path)),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "emet"),
    meta("property", "og:locale", OPEN_GRAPH_LOCALES[locale]),
    ...alternates,
    meta("property", "og:image", image),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", String(OG_IMAGE_WIDTH)),
    meta("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
    meta("property", "og:image:alt", getStrings(locale).share.ogAlt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", image),
  ];
}

/**
 * The head links that install the Website: icons, manifest and the
 * `llms.txt` description.
 * @returns The link tags.
 */
export function installLinkTags(): Tag[] {
  return [
    { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "48x48" } },
    { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
    { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" } },
    { tag: "link", attrs: { rel: "describedby", href: "/llms.txt", type: "text/plain" } },
  ];
}

const AUTHOR_ID = "https://github.com/AndryOre";

/**
 * The JSON-LD graph of the home page: the WebSite, the WebPage and the author.
 * @param locale - The home page's locale.
 * @param title - The page title.
 * @param description - The page description.
 * @returns A `script` tag of type `application/ld+json`.
 */
export function homeJsonLdTag(locale: Locale, title: string, description: string): Tag {
  return {
    tag: "script",
    attrs: { type: "application/ld+json" },
    content: JSON.stringify(homeJsonLd(locale, title, description)).replaceAll("<", "\\u003c"),
  };
}

/**
 * The JSON-LD node list of the home page.
 */
export interface HomeJsonLd {
  "@context": string;
  "@graph": ({ "@type": string; "@id": string } & Record<string, unknown>)[];
}

/**
 * Builds the home page's JSON-LD graph.
 * @param locale - The home page's locale.
 * @param title - The page title.
 * @param description - The page description.
 * @returns The graph with a WebSite, a WebPage and a Person node.
 */
export function homeJsonLd(locale: Locale, title: string, description: string): HomeJsonLd {
  const url = absoluteUrl(locale, "/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: "emet",
        inLanguage: locale,
        author: { "@id": AUTHOR_ID },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        primaryImageOfPage: `${SITE_ORIGIN}${ogImagePath(locale)}`,
        author: { "@id": AUTHOR_ID },
      },
      { "@type": "Person", "@id": AUTHOR_ID, name: "AndryOre", url: AUTHOR_ID },
    ],
  };
}

/**
 * A request path split into its locale and its English path.
 */
export interface LocalizedPath {
  locale: Locale;
  path: string;
}

/**
 * Splits a request pathname into its locale and English path.
 * @param pathname - A pathname such as `/ja/docs/guide/` or `/`.
 * @returns The locale (English without a prefix) and the unprefixed path.
 */
export function splitLocalePath(pathname: string): LocalizedPath {
  const [, first = "", ...rest] = pathname.split("/");
  const locale = LOCALES.find(
    (candidate) => candidate !== DEFAULT_LOCALE && localeSegment(candidate) === first,
  );
  if (!locale) return { locale: DEFAULT_LOCALE, path: pathname };
  return { locale, path: `/${rest.join("/")}` };
}

/**
 * The page a request's share metadata describes.
 */
export interface SharePage {
  locale: Locale;
  path: string;
  isNotFound: boolean;
}

/**
 * Resolves the share page of a request path; the 404 page shares the address
 * of its locale's home page.
 * @param pathname - A pathname such as `/es/404/` or `/ja/docs/guide/`.
 * @returns The locale, the path to describe and whether it is the 404 page.
 */
export function resolveSharePage(pathname: string): SharePage {
  const { locale, path } = splitLocalePath(pathname);
  const isNotFound = path.startsWith("/404");
  return { locale, path: isNotFound ? "/" : path, isNotFound };
}

/**
 * The web app manifest's fields.
 */
export interface WebManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string }[];
}

/**
 * The web app manifest of the Website.
 * @returns The manifest object.
 */
export function buildWebManifest(): WebManifest {
  return {
    name: "emet",
    short_name: "emet",
    description: getStrings(DEFAULT_LOCALE).meta.description,
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#f4fdf6",
    theme_color: "#4f8a2c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
