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
