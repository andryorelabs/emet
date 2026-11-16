import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Repository paths `docker/last-modified.sh` dates, relative to the repo root.
 * A directory covers every tracked file below it.
 */
export const LAST_MODIFIED_ROOTS: readonly string[] = [
  "docs",
  "CHANGELOG.md",
  "apps/site/src/content/translations",
  "apps/site/src/components/home",
  "apps/site/src/pages/index.astro",
  "apps/site/src/pages/[locale]/index.astro",
  "apps/site/src/i18n/ui",
];

/**
 * Source path to `YYYY-MM-DD` last commit date.
 */
export type LastModifiedDates = ReadonlyMap<string, string>;

/**
 * Reads the JSON map `docker/last-modified.sh` prints, which the image build
 * receives as `LAST_MODIFIED_DATES`, since the image has no git history.
 * Malformed input yields no dates, so the sitemap omits `lastmod` instead of
 * failing the build or faking a date.
 * @param raw - The JSON object, or nothing.
 * @returns The valid entries.
 */
export function parseLastModifiedDates(raw: string | undefined): LastModifiedDates {
  const dates = new Map<string, string>();
  if (raw === undefined || raw.trim() === "") return dates;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return dates;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return dates;
  for (const [source, date] of Object.entries(parsed)) {
    if (typeof date === "string" && ISO_DATE.test(date)) dates.set(source, date);
  }
  return dates;
}

/**
 * The newest date across a group of sources; a directory matches every file
 * below it, never a sibling that only shares its prefix.
 * @param sources - Repository paths, files or directories.
 * @param dates - The passed dates.
 * @returns A `YYYY-MM-DD` date, or `undefined` when no source is dated.
 */
export function lastModified(
  sources: readonly string[],
  dates: LastModifiedDates,
): string | undefined {
  let newest: string | undefined;
  for (const requested of sources) {
    const prefix = `${requested.replace(/\/+$/, "")}/`;
    for (const [source, date] of dates) {
      const isMatch = source === requested || source.startsWith(prefix);
      if (isMatch && (newest === undefined || date > newest)) newest = date;
    }
  }
  return newest;
}

/**
 * The sources a locale's home page is rendered from.
 * @param locale - The page locale.
 * @returns Repository paths.
 */
export function homeSources(locale: Locale): readonly string[] {
  return [
    "apps/site/src/components/home",
    locale === DEFAULT_LOCALE
      ? "apps/site/src/pages/index.astro"
      : "apps/site/src/pages/[locale]/index.astro",
    `apps/site/src/i18n/ui/${locale}.ts`,
  ];
}

/**
 * The sources a docs page is rendered from: the English file, and for other
 * locales its translation.
 * @param source - The published source's route id and repository path.
 * @param source.id - Route below `/docs/`.
 * @param source.sourcePath - Repository path of the English file.
 * @param locale - The page locale.
 * @returns Repository paths.
 */
export function docsSources(
  source: { id: string; sourcePath: string },
  locale: Locale,
): readonly string[] {
  if (locale === DEFAULT_LOCALE) return [source.sourcePath];
  return [source.sourcePath, `apps/site/src/content/translations/${locale}/${source.id}.md`];
}
