import { describe, expect, test } from "bun:test";

import { PUBLISHED_SOURCES } from "../apps/site/src/docs/published.ts";
import { hashPublishedSource } from "../apps/site/src/docs/translations.ts";
import { findOutdatedTranslations, formatTranslationsStatus } from "./translations-status.ts";

const CHANGELOG =
  "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- A thing.\n";

const PAGE = "# Page\n\nBody.\n";

function readSource(sourcePath: string): string {
  return sourcePath === "CHANGELOG.md" ? CHANGELOG : PAGE;
}

function currentHash(id: string): string {
  const source = PUBLISHED_SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`${id} is not published`);
  return hashPublishedSource(source.kind, readSource(source.sourcePath));
}

function translation(sourceHash: string): string {
  return `---\ntitle: Title\nsourceHash: ${sourceHash}\n---\n\nBody.\n`;
}

describe("findOutdatedTranslations", () => {
  test("reports nothing when every translation carries the current hash", () => {
    const outdated = findOutdatedTranslations({
      readSource,
      readTranslation: (_locale, id) => translation(currentHash(id)),
    });
    expect(outdated).toEqual([]);
  });

  test("reports a stale translation with the hash it must carry", () => {
    const outdated = findOutdatedTranslations({
      readSource,
      readTranslation: (locale, id) =>
        translation(locale === "es" && id === "whats-new" ? "0000000000000000" : currentHash(id)),
    });
    expect(outdated).toEqual([
      { file: "es/whats-new.md", status: "stale", expectedHash: currentHash("whats-new") },
    ]);
  });

  test("reports a missing translation", () => {
    const outdated = findOutdatedTranslations({
      readSource,
      readTranslation: (locale, id) =>
        locale === "ja" && id === "whats-new" ? undefined : translation(currentHash(id)),
    });
    expect(outdated).toEqual([
      { file: "ja/whats-new.md", status: "missing", expectedHash: currentHash("whats-new") },
    ]);
  });

  test("finds no outdated translation in this checkout", () => {
    expect(findOutdatedTranslations()).toEqual([]);
  });
});

describe("formatTranslationsStatus", () => {
  test("says so when everything is current", () => {
    expect(formatTranslationsStatus([])).toBe("translations: all current");
  });

  test("prints one line per outdated translation with its expected hash", () => {
    const report = formatTranslationsStatus([
      { file: "es/whats-new.md", status: "stale", expectedHash: "abc" },
      { file: "ja/whats-new.md", status: "missing", expectedHash: "abc" },
    ]);
    expect(report.split("\n")).toEqual([
      "translations: 2 outdated",
      "stale  es/whats-new.md  sourceHash: abc",
      "missing  ja/whats-new.md  sourceHash: abc",
    ]);
  });
});
