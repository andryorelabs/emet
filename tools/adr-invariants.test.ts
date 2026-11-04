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

const REVISED_LINE_PATTERN = /^Revised: \d{4}-\d{2}-\d{2}, \S/;
const RELATION_PATTERN = /\b(Supersedes|Superseded by|Amends|Amended by) \[(\d{4})\]\(([^)]+)\)/g;
const INVERSE_RELATION: Readonly<Record<string, string>> = {
  Supersedes: "Superseded by",
  "Superseded by": "Supersedes",
  Amends: "Amended by",
  "Amended by": "Amends",
};

interface AdrRelation {
  readonly kind: string;
  readonly number: number;
  readonly target: string;
}

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
 * Returns the header lines of an ADR: everything before the first `##` section.
 */
function readHeaderLines(adr: AdrFile): string[] {
  const lines = adr.content.split("\n");
  const firstSection = lines.findIndex((line) => line.startsWith("## "));
  return firstSection === -1 ? lines : lines.slice(0, firstSection);
}

/**
 * Extracts the linked supersede/amend relations declared in an ADR header.
 */
function readRelations(adr: AdrFile): AdrRelation[] {
  const header = readHeaderLines(adr).join("\n");
  return [...header.matchAll(RELATION_PATTERN)].map((match) => ({
    kind: match[1] ?? "",
    number: Number(match[2]),
    target: match[3] ?? "",
  }));
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

  test("supersede and amend relations link a real ADR and are recorded on both sides", () => {
    const problems: string[] = [];
    for (const adr of adrs) {
      for (const relation of readRelations(adr)) {
        const other = adrs.find((candidate) => candidate.number === relation.number);
        if (!other || other.fileName !== relation.target) {
          problems.push(
            `${adr.fileName}: "${relation.kind}" links no real ADR (${relation.target})`,
          );
          continue;
        }
        const inverse = INVERSE_RELATION[relation.kind];
        const recorded = readRelations(other).some(
          (candidate) => candidate.kind === inverse && candidate.number === adr.number,
        );
        if (!recorded) {
          problems.push(`${other.fileName}: missing "${inverse}" for ${adr.fileName}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("a Superseded status requires a Superseded by relation", () => {
    const missing = adrs
      .filter((adr) => /^Status: Superseded/m.test(adr.content))
      .filter((adr) => !readRelations(adr).some((relation) => relation.kind === "Superseded by"))
      .map((adr) => adr.fileName);
    expect(missing).toEqual([]);
  });

  for (const adr of adrs) {
    describe(adr.fileName, () => {
      test("Revised lines read Revised: YYYY-MM-DD, <what changed>", () => {
        const revisedLines = readHeaderLines(adr).filter((line) => line.startsWith("Revised:"));
        const invalid = revisedLines.filter((line) => !REVISED_LINE_PATTERN.test(line));
        expect(invalid).toEqual([]);
      });

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
