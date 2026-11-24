import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import { buildSidebar } from "./sidebar";

const EXPECTED_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["Get started", ["docs/start/overview", "docs/start/install", "docs/start/first-run"]],
  [
    "Concepts",
    [
      "docs/concepts/runs-waves-specs",
      "docs/concepts/landing",
      "docs/concepts/review-and-gates",
      "docs/concepts/memory",
      "docs/concepts/attention-and-journal",
      "docs/concepts/living-specs",
      "docs/concepts/security",
      "docs/concepts/architecture",
    ],
  ],
  [
    "How-to",
    [
      "docs/how-to/use-codex",
      "docs/how-to/check-a-fleet",
      "docs/how-to/configure-tracker",
      "docs/how-to/choose-models",
      "docs/how-to/mascot",
    ],
  ],
  [
    "Reference",
    [
      "docs/reference/cli",
      "docs/reference/configuration",
      "docs/reference/dependencies",
      "docs/reference/stability",
    ],
  ],
  ["Help", ["docs/troubleshooting", "docs/whats-new"]],
];

describe("buildSidebar", () => {
  test("holds the five groups in order with exactly the spec's page ids", () => {
    const actual = buildSidebar().map((entry) => {
      if (!("items" in entry)) {
        throw new Error("a top-level sidebar entry is not a group");
      }
      return [entry.label, entry.items.map((item) => ("slug" in item ? item.slug : ""))];
    });
    expect(actual).toEqual(EXPECTED_GROUPS.map(([label, slugs]) => [label, [...slugs]]));
  });

  test("labels every group in every non-default locale", () => {
    for (const entry of buildSidebar()) {
      if (!("items" in entry)) {
        throw new Error("a top-level sidebar entry is not a group");
      }
      const labelled = Object.keys(entry.translations).toSorted();
      expect(labelled).toEqual(LOCALES.filter((locale) => locale !== "en").toSorted());
    }
  });
});
