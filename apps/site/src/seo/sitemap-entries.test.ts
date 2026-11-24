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
    expect(locs).toContain(`${SITE_ORIGIN}/docs/start/install/`);
    expect(locs).toContain(`${SITE_ORIGIN}/ja/docs/start/install/`);
    expect(entries).toHaveLength(LOCALES.length * (1 + PUBLISHED_SOURCES.length));
  });

  test("lists each url once", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  test("gives docs pages their own hreflang alternates", () => {
    const docsEntry = entries.find(({ loc }) => loc === `${SITE_ORIGIN}/es/docs/start/install/`);
    expect(docsEntry?.alternates).toHaveLength(LOCALES.length + 1);
    expect(docsEntry?.alternates.at(-1)?.href).toBe(`${SITE_ORIGIN}/docs/start/install/`);
  });

  test("omits lastmod without passed dates", () => {
    expect(entries.every((sitemapEntry) => sitemapEntry.lastmod === undefined)).toBe(true);
  });

  test("stamps each page with the newest date of its own sources", () => {
    const dated = buildSitemapEntries(
      PUBLISHED_SOURCES,
      new Map([
        ["docs/start/install.md", "2026-09-01"],
        ["apps/site/src/content/translations/es/start/install.md", "2026-10-02"],
        ["apps/site/src/components/home/Hero.astro", "2026-08-15"],
      ]),
    );
    const lastmodOf = (loc: string) =>
      dated.find((sitemapEntry) => sitemapEntry.loc === loc)?.lastmod;
    expect(lastmodOf(`${SITE_ORIGIN}/docs/start/install/`)).toBe("2026-09-01");
    expect(lastmodOf(`${SITE_ORIGIN}/es/docs/start/install/`)).toBe("2026-10-02");
    expect(lastmodOf(`${SITE_ORIGIN}/ja/`)).toBe("2026-08-15");
    expect(lastmodOf(`${SITE_ORIGIN}/docs/how-to/check-a-fleet/`)).toBeUndefined();
  });
});
