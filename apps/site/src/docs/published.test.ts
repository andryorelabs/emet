import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { LOCALES } from "../i18n/locales";
import { loadLocalizedCatalog } from "./catalog";
import { REPOSITORY_ROOT } from "./paths";
import { PUBLISHED_SOURCES } from "./published";

const EXPECTED_SOURCES = [
  "docs/start/overview.md",
  "docs/start/install.md",
  "docs/start/first-run.md",
  "docs/concepts/runs-waves-specs.md",
  "docs/concepts/landing.md",
  "docs/concepts/review-and-gates.md",
  "docs/concepts/memory.md",
  "docs/concepts/attention-and-journal.md",
  "docs/concepts/living-specs.md",
  "docs/concepts/security.md",
  "docs/concepts/architecture.md",
  "docs/how-to/use-codex.md",
  "docs/how-to/check-a-fleet.md",
  "docs/how-to/configure-tracker.md",
  "docs/how-to/choose-models.md",
  "docs/how-to/mascot.md",
  "docs/reference/cli.md",
  "docs/reference/configuration.md",
  "docs/reference/dependencies.md",
  "docs/reference/stability.md",
  "docs/troubleshooting.md",
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

  test("keeps every published source inside the Docker build context", () => {
    const allowed = readFileSync(path.join(REPOSITORY_ROOT, ".dockerignore"), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("!"))
      .map((line) => line.slice(1));
    for (const source of PUBLISHED_SOURCES) {
      const covered = allowed.some(
        (entry) => source.sourcePath === entry || source.sourcePath.startsWith(`${entry}/`),
      );
      expect(covered).toBe(true);
    }
  });

  test("publishes nothing from the private doc folders", () => {
    const forbidden = [
      "docs/adr/",
      "docs/agents/",
      "docs/brand/",
      "docs/specs/",
      "docs/how-to/update-emet.md",
      "docs/contributing/",
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
