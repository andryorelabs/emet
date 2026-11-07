import { LOCALES, type Locale, localePath, localeSegment } from "../i18n/locales";
import { splitLeadingHeading } from "./markdown";
import { githubEditUrl, TRANSLATIONS_REPOSITORY_PATH } from "./paths";
import { PUBLISHED_SOURCES, type PublishedSource } from "./published";
import {
  loadTranslation,
  readRepositorySource,
  type SourceReader,
  type TranslationReader,
  type TranslationStatus,
  readTranslationFile,
} from "./translations";

/**
 * Title of the generated release notes page.
 */
const WHATS_NEW_TITLE = "What's new";

/**
 * One page of the docs in one locale, ready for the content store. A missing
 * or stale translation carries the English text, so every locale has every
 * page.
 */
export interface LocalizedPage {
  /**
   * Starlight entry id, e.g. `docs/guide/fleet` or `es/docs/guide/fleet`.
   */
  id: string;
  locale: Locale;
  title: string;
  description: string;
  seoTitle: string;
  body: string;
  editUrl: string;
  sourcePath: string;
  status: TranslationStatus;
  englishPath: string;
}

/**
 * Starlight entry id of a published page for a locale.
 * @param source - A published source.
 * @param locale - The locale of the entry.
 * @returns The id; English has no locale prefix.
 */
function entryId(source: PublishedSource, locale: Locale): string {
  const path = `docs/${source.id}`;
  return locale === "en" ? path : `${localeSegment(locale)}/${path}`;
}

function englishTitle(source: PublishedSource, markdown: string): string {
  if (source.kind === "changelog") return WHATS_NEW_TITLE;
  const { title } = splitLeadingHeading(markdown);
  if (!title) throw new Error(`${source.sourcePath} has no leading "# " heading`);
  return title;
}

/**
 * Builds one locale's page of a published source.
 * @param source - A published source.
 * @param locale - The locale to build.
 * @param readers - Where to read the English source and translation.
 * @returns The page with its status.
 * @throws {Error} When a markdown source has no leading H1.
 */
export function buildLocalizedPage(
  source: PublishedSource,
  locale: Locale,
  readers: { readSource?: SourceReader; readTranslation?: TranslationReader } = {},
): LocalizedPage {
  const { readSource = readRepositorySource } = readers;
  const loaded = loadTranslation(locale, source.id, readers);
  const title = loaded.fields?.title ?? englishTitle(source, readSource(source.sourcePath));
  return {
    id: entryId(source, locale),
    locale,
    title,
    description: loaded.fields?.description ?? source.description,
    seoTitle: loaded.fields?.seoTitle ?? source.seoTitle,
    body: loaded.body,
    editUrl: githubEditUrl(
      loaded.status === "translated" && locale !== "en"
        ? `${TRANSLATIONS_REPOSITORY_PATH}/${locale}/${source.id}.md`
        : source.sourcePath,
    ),
    sourcePath: source.sourcePath,
    status: loaded.status,
    englishPath: localePath("en", `/docs/${source.id}/`),
  };
}

/**
 * Builds every page of the docs for every locale.
 * @param readers - Where to read the English sources and translations.
 * Default to the repository checkout and the translations folder.
 * @returns One page per published source and locale, English first.
 */
export function loadLocalizedCatalog(
  readers: { readSource?: SourceReader; readTranslation?: TranslationReader } = {},
): LocalizedPage[] {
  const resolved = { readTranslation: readTranslationFile, ...readers };
  return PUBLISHED_SOURCES.flatMap((source) =>
    LOCALES.map((locale) => buildLocalizedPage(source, locale, resolved)),
  );
}
