import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import { NOT_FOUND_STRINGS, notFoundTitle } from "./not-found";

describe("notFoundTitle", () => {
  for (const tag of LOCALES) {
    test(`${tag} title is the message followed by the site name`, () => {
      expect(notFoundTitle(tag)).toBe(`${NOT_FOUND_STRINGS[tag].title} | emet`);
    });
  }
});

describe("NotFoundDocument markup", () => {
  test("renders shadcn empty and button markup with no island", async () => {
    const markup = await Bun.file(new URL("NotFoundDocument.astro", import.meta.url)).text();
    expect(markup).toContain('data-slot="empty"');
    expect(markup).toContain('data-slot="empty-title"');
    expect(markup).toContain("buttonVariants(");
    expect(markup).not.toContain("client:");
  });
});
