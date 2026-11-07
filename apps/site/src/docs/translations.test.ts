import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { DEFAULT_LOCALE, LOCALES } from "../i18n/locales";
import { buildLocalizedPage } from "./catalog";
import { TRANSLATIONS_DIRECTORY } from "./paths";
import { findPublishedSourceById, PUBLISHED_SOURCES } from "./published";
import {
  hashPublishedSource,
  hashSource,
  loadTranslation,
  MalformedTranslationError,
} from "./translations";

const FLEET = findPublishedSourceById("guide/fleet");
const ENGLISH = "# Fleet check\n\nAudit [CLI](../reference/cli.md).\n";

function translationFile(sourceHash: string): string {
  return `---\ntitle: Revisión de flota\nsourceHash: ${sourceHash}\n---\n\nAudita [CLI](../reference/cli.md).\n`;
}

function readers(translation: string | undefined) {
  return { readSource: () => ENGLISH, readTranslation: () => translation };
}

describe("loadTranslation", () => {
  test("returns the English body without the H1 for English", () => {
    const result = loadTranslation("en", "guide/fleet", readers(undefined));
    expect(result.status).toBe("translated");
    expect(result.body).toBe("Audit [CLI](/docs/reference/cli/).\n");
  });

  test("is missing when the locale has no file, and shows English", () => {
    const result = loadTranslation("es", "guide/fleet", readers(undefined));
    expect(result.status).toBe("missing");
    expect(result.body).toBe("Audit [CLI](/es/docs/reference/cli/).\n");
  });

  test("is stale when the sourceHash no longer matches, and shows English", () => {
    const result = loadTranslation(
      "es",
      "guide/fleet",
      readers(translationFile("0000000000000000")),
    );
    expect(result.status).toBe("stale");
    expect(result.body).toContain("Audit");
  });

  test("is translated when the sourceHash matches the English source", () => {
    const result = loadTranslation(
      "es",
      "guide/fleet",
      readers(translationFile(hashSource(ENGLISH))),
    );
    expect(result.status).toBe("translated");
    expect(result.body).toBe("Audita [CLI](/es/docs/reference/cli/).\n");
    expect(result.fields?.title).toBe("Revisión de flota");
  });

  test("rejects a translation without frontmatter", () => {
    expect(() => loadTranslation("es", "guide/fleet", readers("no frontmatter"))).toThrow(
      MalformedTranslationError,
    );
  });

  test("rejects an id that is not published", () => {
    expect(() => loadTranslation("es", "adr/0001", readers(undefined))).toThrow();
  });

  test("hashes the same text the same on every platform", () => {
    expect(hashSource("a\r\nb")).toBe(hashSource("a\nb"));
  });
});

describe("buildLocalizedPage", () => {
  test("carries the status and the English path of a stale page", () => {
    if (!FLEET) throw new Error("guide/fleet is not published");
    const page = buildLocalizedPage(FLEET, "de", readers(translationFile("1111111111111111")));
    expect(page.status).toBe("stale");
    expect(page.id).toBe("de/docs/guide/fleet");
    expect(page.title).toBe("Fleet check");
    expect(page.englishPath).toBe("/docs/guide/fleet/");
  });
});

const TRANSLATED_LOCALES = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE && existsSync(path.join(TRANSLATIONS_DIRECTORY, locale)),
);

describe("published translations", () => {
  test("at least one locale has a translations folder", () => {
    expect(TRANSLATED_LOCALES.length).toBeGreaterThan(0);
  });

  for (const locale of TRANSLATED_LOCALES) {
    for (const source of PUBLISHED_SOURCES) {
      test(`${locale}/${source.id} is translated and current`, () => {
        const loaded = loadTranslation(locale, source.id);
        expect(loaded.status).toBe("translated");
        expect(loaded.fields?.description).toBeTruthy();
      });
    }
  }
});

const RELEASED = "## [1.0.0] - 2026-01-01\n\n### Added\n\n- A thing.\n";

function changelog(unreleased: string): string {
  return `# Changelog\n\n## [Unreleased]\n\n${unreleased}\n\n${RELEASED}`;
}

function changelogTranslation(sourceHash: string): string {
  return `---\ntitle: Novedades\nsourceHash: ${sourceHash}\n---\n\n## 1.0.0\n`;
}

describe("changelog translations", () => {
  test("stays translated when only the Unreleased section changes", () => {
    const stamped = hashPublishedSource("changelog", changelog("- One."));
    const result = loadTranslation("es", "whats-new", {
      readSource: () => changelog("- Two."),
      readTranslation: () => changelogTranslation(stamped),
    });
    expect(result.status).toBe("translated");
  });

  test("goes stale when a released entry changes", () => {
    const stamped = hashPublishedSource("changelog", changelog("- One."));
    const result = loadTranslation("es", "whats-new", {
      readSource: () => changelog("- One.").replace("A thing.", "Another thing."),
      readTranslation: () => changelogTranslation(stamped),
    });
    expect(result.status).toBe("stale");
  });
});
