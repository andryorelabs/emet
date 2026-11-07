import { describe, expect, test } from "bun:test";

import { englishPathOf, resolveLocale } from "./route";

describe("resolveLocale", () => {
  test("matches a language tag case-insensitively", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("pt-br")).toBe("pt-BR");
  });

  test("falls back to English", () => {
    expect(resolveLocale("xx")).toBe("en");
  });
});

describe("englishPathOf", () => {
  test("keeps an English path", () => {
    expect(englishPathOf("/docs/guide/fleet/", "en")).toBe("/docs/guide/fleet/");
  });

  test("strips the locale segment", () => {
    expect(englishPathOf("/pt-br/docs/guide/fleet/", "pt-BR")).toBe("/docs/guide/fleet/");
    expect(englishPathOf("/es/docs/", "es")).toBe("/docs/");
  });
});
