import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import { classifySearchState, matchesTemplate, moveSearchFocus } from "./search-markup";
import { SEARCH_STRINGS, SEARCH_TERM_TOKEN } from "./search-strings";

describe("SEARCH_STRINGS", () => {
  test("has an entry for exactly the ten locales", () => {
    expect(Object.keys(SEARCH_STRINGS).toSorted()).toEqual([...LOCALES].toSorted());
  });

  test("fills every string in every locale", () => {
    for (const locale of LOCALES) {
      const { noResults, ...texts } = SEARCH_STRINGS[locale];
      for (const [key, value] of Object.entries(texts)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
      expect(noResults("zzqqxx"), `${locale}.noResults`).toContain("zzqqxx");
    }
  });

  test("keeps the English copy of the canvas", () => {
    const en = SEARCH_STRINGS.en;
    expect(en.placeholder).toBe("Search the docs");
    expect(en.searching).toBe("Searching…");
    expect(en.noResults("zzqqxx")).toBe("Nothing matches “zzqqxx”. Try fewer words.");
    expect(en.footerPrivacy).toBe("Search runs in your browser. Nothing leaves this site.");
    expect(en.footerKeys).toBe("↑↓ to move, Enter to open");
  });
});

describe("matchesTemplate", () => {
  const template = SEARCH_STRINGS.en.noResults(SEARCH_TERM_TOKEN);

  test("matches a template whose placeholder holds the query", () => {
    expect(matchesTemplate(SEARCH_STRINGS.en.noResults("wave"), template, SEARCH_TERM_TOKEN)).toBe(
      true,
    );
  });

  test("rejects other messages and compares a template without a placeholder whole", () => {
    expect(matchesTemplate("3 results", template, SEARCH_TERM_TOKEN)).toBe(false);
    expect(matchesTemplate("Searching…", "Searching…", SEARCH_TERM_TOKEN)).toBe(true);
    expect(matchesTemplate("Searching", "Searching…", SEARCH_TERM_TOKEN)).toBe(false);
  });
});

describe("classifySearchState", () => {
  const templates = {
    searching: SEARCH_STRINGS.en.searching,
    noResults: SEARCH_STRINGS.en.noResults(SEARCH_TERM_TOKEN),
    token: SEARCH_TERM_TOKEN,
  };

  test("is idle without a message or results", () => {
    expect(classifySearchState({ message: "", hasResults: false }, templates)).toBe("idle");
  });

  test("reads the searching and no-results messages", () => {
    expect(classifySearchState({ message: "Searching…", hasResults: false }, templates)).toBe(
      "searching",
    );
    expect(
      classifySearchState(
        { message: "Nothing matches “zzqqxx”. Try fewer words.", hasResults: false },
        templates,
      ),
    ).toBe("empty");
  });

  test("is results when Pagefind lists matches under its count message", () => {
    expect(
      classifySearchState({ message: "2 results for “wave”", hasResults: true }, templates),
    ).toBe("results");
  });
});

describe("moveSearchFocus", () => {
  test("moves down and up the list and stops at both ends", () => {
    expect(moveSearchFocus(0, 4, 1)).toBe(1);
    expect(moveSearchFocus(3, 4, 1)).toBe(3);
    expect(moveSearchFocus(1, 4, -1)).toBe(0);
    expect(moveSearchFocus(0, 4, -1)).toBe(0);
  });

  test("starts at the first position from no focus and has none for an empty list", () => {
    expect(moveSearchFocus(-1, 4, 1)).toBe(0);
    expect(moveSearchFocus(0, 0, 1)).toBe(-1);
  });
});
