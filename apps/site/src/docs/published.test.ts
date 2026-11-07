import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { LOCALES } from "../i18n/locales";
import { loadLocalizedCatalog } from "./catalog";
import { REPOSITORY_ROOT } from "./paths";
import { PUBLISHED_SOURCES } from "./published";

const EXPECTED_SOURCES = [
  "docs/guide/getting-started.md",
  "docs/guide/fleet.md",
  "docs/guide/models-and-effort.md",
  "docs/guide/trackers-and-landing.md",
  "docs/reference/cli.md",
  "docs/reference/configuration.md",
  "docs/reference/dependencies.md",
  "docs/troubleshooting.md",
  "docs/architecture.md",
  "docs/how-to/update-emet.md",
  "docs/how-to/mascot.md",
  "CHANGELOG.md",
];

describe("the published allowlist", () => {
  test("is exactly the files the spec names", () => {
    expect(PUBLISHED_SOURCES.map((source) => source.sourcePath).toSorted()).toEqual(
      EXPECTED_SOURCES.toSorted(),
    );
  });

  test("only names files that exist", () => {
    for (const source of PUBLISHED_SOURCES) {
      expect(existsSync(path.join(REPOSITORY_ROOT, source.sourcePath))).toBe(true);
    }
  });

  test("publishes nothing from the private doc folders", () => {
    const forbidden = [
      "docs/adr/",
      "docs/agents/",
      "docs/brand/",
      "docs/specs/",
      "docs/how-to/cut-a-release.md",
    ];
    for (const source of PUBLISHED_SOURCES) {
      expect(forbidden.some((prefix) => source.sourcePath.startsWith(prefix))).toBe(false);
    }
  });

  test("keeps SEO fields within their limits", () => {
    for (const source of PUBLISHED_SOURCES) {
      expect(source.description.length).toBeLessThanOrEqual(155);
      expect(source.seoTitle.length).toBeLessThanOrEqual(53);
    }
  });

  test("has a page for every source and locale, with no unresolved repository link", () => {
    const pages = loadLocalizedCatalog();
    expect(pages).toHaveLength(PUBLISHED_SOURCES.length * LOCALES.length);
    for (const page of pages) {
      expect(page.body).not.toMatch(/\]\((?!https?:|\/|#|mailto:)[^)]*\.md/);
    }
  });
});
