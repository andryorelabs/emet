import { describe, expect, spyOn, test } from "bun:test";

import { PUBLISHED_SOURCES } from "../apps/site/src/docs/published.ts";
import { hashPublishedSource } from "../apps/site/src/docs/translations.ts";
import { runTranslationsStatus } from "./translations-status.ts";

const PAGE = "# Page\n\nBody.\n";
const CHANGELOG =
  "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- A thing.\n";

function readSource(sourcePath: string): string {
  return sourcePath === "CHANGELOG.md" ? CHANGELOG : PAGE;
}

function currentTranslation(id: string): string {
  const source = PUBLISHED_SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`${id} is not published`);
  const hash = hashPublishedSource(source.kind, readSource(source.sourcePath));
  return `---\ntitle: Title\nsourceHash: ${hash}\n---\n\nBody.\n`;
}

describe("runTranslationsStatus", () => {
  test("logs the all-current line and returns 0", () => {
    const logged: string[] = [];
    const code = runTranslationsStatus(
      { readSource, readTranslation: (_locale, id) => currentTranslation(id) },
      (message) => logged.push(message),
    );
    expect(code).toBe(0);
    expect(logged).toEqual(["translations: all current"]);
  });

  test("logs the outdated report and returns 1", () => {
    const logged: string[] = [];
    const code = runTranslationsStatus(
      {
        readSource,
        readTranslation: (locale, id) =>
          locale === "ja" && id === "whats-new" ? undefined : currentTranslation(id),
      },
      (message) => logged.push(message),
    );
    expect(code).toBe(1);
    expect(logged[0]).toContain("translations: 1 outdated");
    expect(logged[0]).toContain("missing  ja/whats-new.md");
  });

  test("reads this checkout and logs to the console by default", () => {
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect([0, 1]).toContain(runTranslationsStatus());
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
