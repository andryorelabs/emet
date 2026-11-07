import { describe, expect, test } from "bun:test";

import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, localePath, localeSegment } from "./locales";

describe("localePath", () => {
  test("serves English unprefixed with a trailing slash", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("en", "/docs/guide")).toBe("/docs/guide/");
  });

  test("prefixes other locales with their lower-case tag", () => {
    expect(localePath("pt-BR", "/")).toBe("/pt-br/");
    expect(localePath("zh-CN", "docs/guide")).toBe("/zh-cn/docs/guide/");
    expect(localePath("es", "/docs/guide/")).toBe("/es/docs/guide/");
  });

  test("always ends with a slash", () => {
    for (const locale of LOCALES) {
      expect(localePath(locale, "/docs").endsWith("/")).toBe(true);
    }
  });
});

describe("locales", () => {
  test("English is the default and listed first", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES[0]).toBe("en");
  });

  test("every locale has a name and a unique segment", () => {
    expect(Object.keys(LOCALE_NAMES).toSorted()).toEqual(LOCALES.toSorted());
    expect(new Set(LOCALES.map(localeSegment)).size).toBe(LOCALES.length);
  });
});
