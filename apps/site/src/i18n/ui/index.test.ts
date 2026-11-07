import { describe, expect, test } from "bun:test";

import { DEFAULT_LOCALE, LOCALES } from "../locales";
import { en } from "./en";
import { getStrings } from "./index";

/**
 * Every leaf string of a strings tree by its dotted path, array positions in
 * brackets.
 * @param value - A strings tree.
 * @param prefix - The path so far.
 * @returns The leaf paths and their strings, in source order.
 */
function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") {
    return [[prefix, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${prefix}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  throw new Error(`Unexpected value at ${prefix}`);
}

const englishPaths = leaves(en).map(([path]) => path);
const translated = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe("getStrings", () => {
  test("returns the English source for the default locale", () => {
    expect(getStrings(DEFAULT_LOCALE)).toBe(en);
  });

  test("serves a module for every locale", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale)).toBeDefined();
    }
  });
});

describe("locale string parity", () => {
  for (const locale of translated) {
    test(`${locale} has exactly the English keys and no empty string`, () => {
      const strings = getStrings(locale);
      const entries = leaves(strings);
      expect(entries.map(([path]) => path)).toEqual(englishPaths);
      for (const [, text] of entries) {
        expect(text.trim()).not.toBe("");
      }
    });

    test(`${locale} translates the notice and keeps product names verbatim`, () => {
      const strings = getStrings(locale);
      expect(strings.footer.notice).not.toBe(en.footer.notice);
      expect(strings.footer.notice).toContain("Anthropic");
      const answers = strings.faq.items.map((item) => item.answer).join("\n");
      expect(strings.faq.items).toHaveLength(6);
      for (const name of ["Claude Code", "mattpocock-skills", "WSL", "Anthropic"]) {
        expect(answers).toContain(name);
      }
      expect(strings.footer.builtBy).toContain("AndryOre");
      expect(strings.hero.name).toBe("emet");
      expect(strings.how.request).toBe(en.how.request);
      expect(strings.footer.description).toContain("Claude Code");
      expect(strings.hero.sentence).toContain("Claude Code");
    });
  }
});
