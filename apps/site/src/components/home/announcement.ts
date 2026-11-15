import { findPublishedSourceById, publishedRoute } from "../../docs/published";
import { parseChangelog } from "../../docs/release-notes";
import type { Locale } from "../../i18n/locales";

/**
 * The newest release shown in the hero pill.
 */
export interface LatestRelease {
  version: string;
  href: string;
}

/**
 * Finds the newest CHANGELOG entry and the What's new link to it.
 * @param changelog - The raw `CHANGELOG.md` contents.
 * @param locale - Locale whose What's new route applies.
 * @returns The version and the href of its entry, or `null` when the changelog has no entry.
 */
export function latestRelease(changelog: string, locale: Locale): LatestRelease | null {
  const [newest] = parseChangelog(changelog);
  const source = findPublishedSourceById("whats-new");
  if (!newest || !source) return null;
  const anchor = newest.version.replaceAll(".", "");
  return { version: newest.version, href: `${publishedRoute(source, locale)}#${anchor}` };
}
