import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  LAST_MODIFIED_ROOTS,
  docsSources,
  homeSources,
  lastModified,
  parseLastModifiedDates,
} from "./last-modified";

const script = readFileSync(new URL("../../docker/last-modified.sh", import.meta.url), "utf8");

describe("parseLastModifiedDates", () => {
  test("keeps the well-formed dates of a JSON object", () => {
    const dates = parseLastModifiedDates(
      JSON.stringify({ "docs/a.md": "2026-09-01", "docs/b.md": "yesterday", "docs/c.md": 3 }),
    );
    expect([...dates]).toEqual([["docs/a.md", "2026-09-01"]]);
  });

  test("yields no dates for missing, blank, malformed or non-object input", () => {
    for (const raw of [undefined, "", "  ", "not json", "null", "[]", '"2026-01-01"']) {
      expect(parseLastModifiedDates(raw).size).toBe(0);
    }
  });
});

describe("lastModified", () => {
  const dates = parseLastModifiedDates(
    JSON.stringify({
      "docs/guide/a.md": "2026-09-01",
      "docs/guide/b.md": "2026-10-02",
      "docs/guide-x/c.md": "2026-12-01",
      "CHANGELOG.md": "2026-08-15",
    }),
  );

  test("reads a file's own date", () => {
    expect(lastModified(["CHANGELOG.md"], dates)).toBe("2026-08-15");
  });

  test("takes the newest date across a group, directories included", () => {
    expect(lastModified(["CHANGELOG.md", "docs/guide/"], dates)).toBe("2026-10-02");
  });

  test("never matches a sibling that only shares the directory prefix", () => {
    expect(lastModified(["docs/guide"], dates)).toBe("2026-10-02");
  });

  test("returns nothing for undated sources", () => {
    expect(lastModified(["docs/missing.md"], dates)).toBeUndefined();
  });
});

describe("page sources", () => {
  test("date the English home from the root page and the others from the locale page", () => {
    expect(homeSources("en")).toContain("apps/site/src/pages/index.astro");
    expect(homeSources("ja")).toContain("apps/site/src/pages/[locale]/index.astro");
    expect(homeSources("pt-BR")).toContain("apps/site/src/i18n/ui/pt-BR.ts");
  });

  test("date a translated docs page from both the English file and its translation", () => {
    const source = { id: "guide/fleet", sourcePath: "docs/guide/fleet.md" };
    expect(docsSources(source, "en")).toEqual(["docs/guide/fleet.md"]);
    expect(docsSources(source, "es")).toEqual([
      "docs/guide/fleet.md",
      "apps/site/src/content/translations/es/guide/fleet.md",
    ]);
  });

  test("are all covered by a root docker/last-modified.sh dates", () => {
    const sources = [
      ...homeSources("en"),
      ...homeSources("ko"),
      ...docsSources({ id: "whats-new", sourcePath: "CHANGELOG.md" }, "fr"),
    ];
    for (const source of sources) {
      expect(
        LAST_MODIFIED_ROOTS.some((root) => source === root || source.startsWith(`${root}/`)),
      ).toBe(true);
    }
    for (const root of LAST_MODIFIED_ROOTS) expect(script).toContain(root);
  });
});
