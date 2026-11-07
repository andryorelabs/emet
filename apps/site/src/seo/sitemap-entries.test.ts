import { describe, expect, test } from "bun:test";

import { PUBLISHED_SOURCES } from "../docs/published";
import { LOCALES } from "../i18n/locales";
import { SITE_ORIGIN } from "./alternates";
import { buildSitemapEntries } from "./sitemap-entries";

describe("buildSitemapEntries", () => {
  const entries = buildSitemapEntries(PUBLISHED_SOURCES);
  const locs = entries.map(({ loc }) => loc);

  test("lists the home page of every locale", () => {
    for (const path of ["/", "/es/", "/pt-br/", "/zh-cn/"]) {
      expect(locs).toContain(`${SITE_ORIGIN}${path}`);
    }
  });

  test("lists every docs page in every locale", () => {
    expect(locs).toContain(`${SITE_ORIGIN}/docs/guide/getting-started/`);
    expect(locs).toContain(`${SITE_ORIGIN}/ja/docs/guide/getting-started/`);
    expect(entries).toHaveLength(LOCALES.length * (1 + PUBLISHED_SOURCES.length));
  });

  test("lists each url once", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  test("gives docs pages their own hreflang alternates", () => {
    const docsEntry = entries.find(
      ({ loc }) => loc === `${SITE_ORIGIN}/es/docs/guide/getting-started/`,
    );
    expect(docsEntry?.alternates).toHaveLength(LOCALES.length + 1);
    expect(docsEntry?.alternates.at(-1)?.href).toBe(`${SITE_ORIGIN}/docs/guide/getting-started/`);
  });
});
