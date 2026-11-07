import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { DEFAULT_LOCALE, LOCALES, localeSegment } from "../i18n/locales";

const siteConf = readFileSync(new URL("../../docker/site.conf", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../../docker/smoke.sh", import.meta.url), "utf8");

const NON_DEFAULT_SEGMENTS = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(
  localeSegment,
);

function alternationsOf(source: string): string[][] {
  return [
    ...source.matchAll(/\((?:\?<locale_segment>|\?:)((?:[a-z]{2}(?:-[a-z]{2})?\|)+[a-z-]+)\)/g),
  ]
    .map((match) => (match[1] ?? "").split("|"))
    .filter((segments) => segments.length > 2);
}

describe("docker/site.conf", () => {
  test("serves each non-default locale its own 404 through the map and the internal location", () => {
    const alternations = alternationsOf(siteConf);
    expect(alternations.length).toBeGreaterThanOrEqual(2);
    for (const segments of alternations) {
      expect(segments).toEqual(NON_DEFAULT_SEGMENTS);
    }
  });
});

describe("docker/smoke.sh", () => {
  test("checks the localized 404 of every non-default locale", () => {
    for (const segment of NON_DEFAULT_SEGMENTS) {
      expect(smoke).toContain(segment);
    }
  });

  test("checks that Starlight's sitemap index is not built", () => {
    expect(smoke).toContain("/sitemap-index.xml");
    expect(smoke).toContain('rel="sitemap"');
  });
});
