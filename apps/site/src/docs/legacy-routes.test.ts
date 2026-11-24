import { describe, expect, test } from "bun:test";

import { LOCALES, localePath } from "../i18n/locales";
import { DOCS_ENTRY_ID, LEGACY_DOC_IDS, buildDocsRedirects } from "./legacy-routes";
import { PUBLISHED_SOURCES, findPublishedSourceById } from "./published";

const PUBLISHED_ROUTES = new Set(
  LOCALES.flatMap((locale) =>
    PUBLISHED_SOURCES.map((source) => localePath(locale, `/docs/${source.id}/`)),
  ),
);

describe("the docs redirect table", () => {
  const redirects = buildDocsRedirects();

  test("sends every pre-change route in every locale to a published route", () => {
    for (const locale of LOCALES) {
      for (const oldId of Object.keys(LEGACY_DOC_IDS)) {
        const target = redirects[localePath(locale, `/docs/${oldId}/`)];
        expect(target).toBeDefined();
        expect(PUBLISHED_ROUTES.has(target ?? "")).toBe(true);
      }
    }
  });

  test("sends each docs root to the overview", () => {
    expect(findPublishedSourceById(DOCS_ENTRY_ID)).toBeDefined();
    for (const locale of LOCALES) {
      expect(redirects[localePath(locale, "/docs/")]).toBe(
        localePath(locale, `/docs/${DOCS_ENTRY_ID}/`),
      );
    }
  });

  test("never redirects from a route that is still published", () => {
    for (const from of Object.keys(redirects)) {
      expect(PUBLISHED_ROUTES.has(from)).toBe(false);
    }
  });

  test("keeps the legacy ids out of the allowlist", () => {
    for (const oldId of Object.keys(LEGACY_DOC_IDS)) {
      expect(findPublishedSourceById(oldId)).toBeUndefined();
    }
  });
});
