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

const HOST_NAMES = ["Claude Code", "Codex"] as const;

/**
 * Asserts the footer description, hero sentence and FAQ answers each name both
 * Agent hosts.
 * @param strings - One locale's strings.
 * @returns Nothing.
 */
function expectNamesBothHosts(strings: ReturnType<typeof getStrings>): void {
  const faqAnswers = strings.faq.items.map((item) => item.answer).join("\n");
  for (const name of HOST_NAMES) {
    expect(strings.footer.description).toContain(name);
    expect(strings.hero.sentence).toContain(name);
    expect(faqAnswers).toContain(name);
  }
}

/**
 * Asserts the footer notice and every FAQ answer that names Anthropic also name
 * OpenAI, and that at least one such answer exists.
 * @param strings - One locale's strings.
 * @returns Nothing.
 */
function expectNamesBothVendors(strings: ReturnType<typeof getStrings>): void {
  expect(strings.footer.notice).toContain("Anthropic");
  expect(strings.footer.notice).toContain("OpenAI");
  const vendorAnswers = strings.faq.items
    .map((item) => item.answer)
    .filter((answer) => answer.includes("Anthropic"));
  expect(vendorAnswers.length).toBeGreaterThan(0);
  for (const answer of vendorAnswers) {
    expect(answer).toContain("OpenAI");
  }
}

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
    });

    test(`${locale} names Anthropic and OpenAI in the notice and FAQ answer`, () => {
      expectNamesBothVendors(getStrings(locale));
    });

    test(`${locale} has no how.tabPlugin key`, () => {
      expect(leaves(getStrings(locale)).map(([path]) => path)).not.toContain("how.tabPlugin");
    });

    test(`${locale} names both Agent hosts in the footer, hero and FAQ`, () => {
      expectNamesBothHosts(getStrings(locale));
    });
  }
});

/**
 * Removes every "Codex" from a string, as a locale that dropped the host would.
 * @param text - A locale string.
 * @returns The string without "Codex".
 */
function stripCodex(text: string): string {
  return text.replaceAll("Codex", "");
}

/**
 * Removes every "OpenAI" from a string, as a locale that dropped the vendor would.
 * @param text - A locale string.
 * @returns The string without "OpenAI".
 */
function dropOpenAi(text: string): string {
  return text.replaceAll("OpenAI", "");
}

describe("vendor naming guard", () => {
  test("fails when a locale drops OpenAI from the notice or the FAQ answer", () => {
    const base = getStrings("es");
    const dropped = [
      { ...base, footer: { ...base.footer, notice: dropOpenAi(base.footer.notice) } },
      {
        ...base,
        faq: {
          ...base.faq,
          items: base.faq.items.map((item) => ({
            question: item.question,
            answer: dropOpenAi(item.answer),
          })),
        },
      },
    ];
    for (const mutated of dropped) {
      expect(() => expectNamesBothVendors(mutated)).toThrow();
    }
  });
});

describe("host naming guard", () => {
  test("fails when a locale drops Codex from any of the three strings", () => {
    const base = getStrings("es");
    const dropped = [
      { ...base, footer: { ...base.footer, description: stripCodex(base.footer.description) } },
      { ...base, hero: { ...base.hero, sentence: stripCodex(base.hero.sentence) } },
      {
        ...base,
        faq: {
          ...base.faq,
          items: base.faq.items.map((item) => ({
            question: item.question,
            answer: stripCodex(item.answer),
          })),
        },
      },
    ];
    for (const mutated of dropped) {
      expect(() => expectNamesBothHosts(mutated)).toThrow();
    }
  });
});
