import { LOCALES, localePath } from "../i18n/locales";

/**
 * Page ids the docs published before the information architecture change,
 * each with the id that now holds its content. Ids that kept their id are not
 * listed.
 */
export const LEGACY_DOC_IDS: Readonly<Record<string, string>> = {
  "guide/getting-started": "start/install",
  "guide/fleet": "how-to/check-a-fleet",
  "guide/models-and-effort": "how-to/choose-models",
  "guide/trackers-and-landing": "how-to/configure-tracker",
  "guide/codex": "how-to/use-codex",
  architecture: "concepts/architecture",
  "how-to/update-emet": "start/install",
};

/**
 * The page the docs root redirects to.
 */
export const DOCS_ENTRY_ID = "start/overview";

/**
 * Builds the redirect table for Astro's `redirects` option: the docs root and
 * every pre-change docs route, in every locale.
 * @returns A map from old route to new route, both with a trailing slash.
 */
export function buildDocsRedirects(): Record<string, string> {
  const redirects: Record<string, string> = {};
  for (const locale of LOCALES) {
    redirects[localePath(locale, "/docs/")] = localePath(locale, `/docs/${DOCS_ENTRY_ID}/`);
    for (const [oldId, newId] of Object.entries(LEGACY_DOC_IDS)) {
      redirects[localePath(locale, `/docs/${oldId}/`)] = localePath(locale, `/docs/${newId}/`);
    }
  }
  return redirects;
}
