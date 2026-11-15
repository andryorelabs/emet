import { describe, expect, test } from "bun:test";

import { buildLocalizedPage } from "./catalog";
import { buildLlmsFullTxt, markdownTwinPath, renderMarkdownTwin } from "./markdown-twin";
import { PUBLISHED_SOURCES } from "./published";

const fleet = PUBLISHED_SOURCES.find((source) => source.id === "guide/fleet");
if (!fleet) throw new Error("guide/fleet is not published");

const ENGLISH = "# Fleet Check\n\nEnglish body.\n";
const readSource = () => ENGLISH;

describe("markdownTwinPath", () => {
  test("appends .md under the page route", () => {
    expect(markdownTwinPath("docs/guide/fleet")).toBe("/docs/guide/fleet.md");
    expect(markdownTwinPath("es/docs/guide/fleet")).toBe("/es/docs/guide/fleet.md");
  });
});

describe("renderMarkdownTwin", () => {
  test("starts with the H1 and then the body", () => {
    const page = buildLocalizedPage(fleet, "en", { readSource });
    expect(renderMarkdownTwin(page)).toBe("# Fleet Check\n\nEnglish body.\n");
  });

  test("falls back to English when the translation is missing", () => {
    const page = buildLocalizedPage(fleet, "es", { readSource, readTranslation: () => undefined });
    expect(page.status).not.toBe("translated");
    expect(renderMarkdownTwin(page)).toBe("# Fleet Check\n\nEnglish body.\n");
  });

  test("falls back to English when the translation is stale", () => {
    const stale = [
      "---",
      "title: Revisión de flota",
      "description: Audita repos.",
      "seoTitle: Flota",
      "sourceHash: stale",
      "---",
      "",
      "Cuerpo español.",
      "",
    ].join("\n");
    const page = buildLocalizedPage(fleet, "es", { readSource, readTranslation: () => stale });
    expect(page.status).not.toBe("translated");
    expect(renderMarkdownTwin(page)).toContain("English body.");
    expect(renderMarkdownTwin(page)).not.toContain("Cuerpo español.");
  });
});

describe("buildLlmsFullTxt", () => {
  test("concatenates English twins in the given order, each from its H1", () => {
    const pages = PUBLISHED_SOURCES.map((source) =>
      buildLocalizedPage(source, "en", {
        readSource: (path) => `# Title of ${path}\n\nBody of ${path}.\n`,
      }),
    );
    const text = buildLlmsFullTxt(pages);
    const positions = pages.map((page) => text.indexOf(`# ${page.title}\n`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions.toSorted((a, b) => a - b)).toEqual(positions);
    expect(text.startsWith("# ")).toBe(true);
  });

  test("skips non-English pages", () => {
    const pages = [
      buildLocalizedPage(fleet, "en", { readSource }),
      buildLocalizedPage(fleet, "es", { readSource, readTranslation: () => undefined }),
    ];
    expect(buildLlmsFullTxt(pages).match(/^# Fleet Check$/gm)).toHaveLength(1);
  });
});
