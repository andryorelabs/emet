import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_LOCALE, LOCALES } from "../apps/site/src/i18n/locales.ts";
import { TRANSLATIONS_REPOSITORY_PATH } from "../apps/site/src/docs/paths.ts";
import { PUBLISHED_SOURCES } from "../apps/site/src/docs/published.ts";
import {
  hashPublishedSource,
  loadTranslation,
  type SourceReader,
  type TranslationReader,
} from "../apps/site/src/docs/translations.ts";

const REPO_ROOT = path.join(import.meta.dir, "..");

/** Reads an English source below the repository root, whatever the working directory. */
const readSourceFromRepo: SourceReader = (sourcePath) =>
  readFileSync(path.join(REPO_ROOT, sourcePath), "utf8");

/** Reads a translation file, or `undefined` when the locale has none. */
const readTranslationFromRepo: TranslationReader = (locale, id) => {
  const file = path.join(REPO_ROOT, TRANSLATIONS_REPOSITORY_PATH, locale, `${id}.md`);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
};

/**
 * A translation that no longer matches its English source.
 */
export interface OutdatedTranslation {
  /** Path below `apps/site/src/content/translations/`. */
  file: string;
  status: "stale" | "missing";
  /** The `sourceHash` the translation must carry to be current. */
  expectedHash: string;
}

/**
 * Lists every translation of a published page that is stale or missing,
 * with the hash a current translation records.
 * @param readers - Where to read the English sources and the translations.
 * Default to this checkout, resolved from the script's own location.
 * @returns One entry per outdated translation, in published and locale order.
 */
export function findOutdatedTranslations(
  readers: { readSource?: SourceReader; readTranslation?: TranslationReader } = {},
): OutdatedTranslation[] {
  const { readSource = readSourceFromRepo, readTranslation = readTranslationFromRepo } = readers;
  const outdated: OutdatedTranslation[] = [];
  for (const source of PUBLISHED_SOURCES) {
    const expectedHash = hashPublishedSource(source.kind, readSource(source.sourcePath));
    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      const { status } = loadTranslation(locale, source.id, { readSource, readTranslation });
      if (status !== "translated") {
        outdated.push({ file: `${locale}/${source.id}.md`, status, expectedHash });
      }
    }
  }
  return outdated;
}

/**
 * Renders the report the script prints.
 * @param outdated - The result of {@link findOutdatedTranslations}.
 * @returns One line per outdated translation, or a single all-current line.
 */
export function formatTranslationsStatus(outdated: readonly OutdatedTranslation[]): string {
  if (outdated.length === 0) return "translations: all current";
  const lines = outdated.map(
    (entry) => `${entry.status}  ${entry.file}  sourceHash: ${entry.expectedHash}`,
  );
  return [`translations: ${outdated.length} outdated`, ...lines].join("\n");
}

if (import.meta.main) {
  const outdated = findOutdatedTranslations();
  console.log(formatTranslationsStatus(outdated));
  process.exit(outdated.length === 0 ? 0 : 1);
}
