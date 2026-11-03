import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ADR_DIRECTORY = join(import.meta.dir, "..", "docs", "adr");
const ADR_FILE_PATTERN = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const REQUIRED_SECTIONS = [
  "## Context",
  "## Decision",
  "## Consequences",
  "## Alternatives considered",
];

interface AdrFile {
  readonly fileName: string;
  readonly number: number;
  readonly content: string;
}

interface IndexRow {
  readonly number: number;
  readonly fileName: string;
  readonly cells: readonly string[];
}

/**
 * Reads every `NNNN-kebab-title.md` file in `docs/adr`, sorted by file name.
 */
function readAdrFiles(): AdrFile[] {
  return readdirSync(ADR_DIRECTORY)
    .filter((fileName) => fileName !== "README.md")
    .toSorted()
    .map((fileName) => {
      const match = ADR_FILE_PATTERN.exec(fileName);
      return {
        fileName,
        number: match ? Number(match[1]) : Number.NaN,
        content: readFileSync(join(ADR_DIRECTORY, fileName), "utf8"),
      };
    });
}

/**
 * Parses the index table rows of `docs/adr/README.md`.
 */
function readIndexRows(): IndexRow[] {
  const readme = readFileSync(join(ADR_DIRECTORY, "README.md"), "utf8");
  return readme
    .split("\n")
    .filter((line) => /^\| \d{4} \|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      const link = /\]\(([^)]+)\)/.exec(cells[1] ?? "");
      return { number: Number(cells[0]), fileName: link?.[1] ?? "", cells };
    });
}

describe("ADR invariants", () => {
  const adrs = readAdrFiles();

  test("every file name is NNNN-kebab-title.md", () => {
    const invalid = adrs.filter((adr) => Number.isNaN(adr.number)).map((adr) => adr.fileName);
    expect(invalid).toEqual([]);
  });

  test("numbering is unique and contiguous from 0001", () => {
    const numbers = adrs.map((adr) => adr.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  test("the index header has the four required columns", () => {
    const readme = readFileSync(join(ADR_DIRECTORY, "README.md"), "utf8");
    const headerLine = readme.split("\n").find((line) => /^\| #\s*\|/.test(line)) ?? "";
    const columns = headerLine
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    expect(columns).toEqual(["#", "Title", "Status", "Superseded or amended by"]);
  });

  test("every ADR has an index row and every row has a file", () => {
    const rows = readIndexRows();
    expect(rows.map((row) => row.fileName).toSorted()).toEqual(adrs.map((adr) => adr.fileName));
    for (const row of rows) {
      const adr = adrs.find((candidate) => candidate.fileName === row.fileName);
      expect(adr?.number).toBe(row.number);
      expect(row.cells).toHaveLength(4);
    }
  });

  for (const adr of adrs) {
    describe(adr.fileName, () => {
      test("starts with its numbered title", () => {
        const number = String(adr.number).padStart(4, "0");
        expect(adr.content.startsWith(`# ${number}. `)).toBe(true);
      });

      test("has a dated Status line", () => {
        expect(adr.content).toMatch(
          /^Status: (Proposed|Accepted|Superseded|Deprecated)[^\n]*\(\d{4}-\d{2}-\d{2}\)/m,
        );
      });

      test("has every required section", () => {
        const headings = adr.content.split("\n").filter((line) => line.startsWith("## "));
        for (const section of REQUIRED_SECTIONS) {
          expect(headings).toContain(section);
        }
      });
    });
  }
});
