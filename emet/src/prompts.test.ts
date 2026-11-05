import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/**
 * Byte ceilings, measured on trunk after wave 4 plus ~4% headroom. Raising one
 * is a reviewed decision: edit the number here, in the same PR as the growth.
 */
const BYTE_CEILINGS: Readonly<Record<string, number>> = {
  "commands/emet.md": 8100,
  "emet/reference/incidents.md": 12950,
  "emet/reference/phases-1-5.md": 11300,
  "emet/reference/phases-6-7-dispatch.md": 16310,
  "emet/reference/phases-8-closeout.md": 13350,
  "emet/reference/phases-9-handoff.md": 4980,
  "emet/reference/reviewer-prompt.md": 2550,
  "emet/reference/tracker-github.md": 3250,
  "emet/reference/tracker-linear.md": 4850,
  "emet/reference/tracker-local.md": 1810,
  "emet/reference/worker-prompt.md": 7600,
  "agents/emet-reviewer.md": 1980,
  "agents/emet-worker.md": 1230,
};

/**
 * Hard cap for every reference file, independent of its ceiling: a prompt over
 * this size is split, not given a bigger ceiling (compaction safety).
 */
const REFERENCE_HARD_CAP_BYTES = 20_000;

const PINNED_DIRECTORIES = ["emet/reference", "agents"] as const;

const BANNED_PHRASES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  {
    label: "inline `bun -e` snippet invoking claims/slots",
    pattern: /^\s*(?:\$\s*)?bun -e\b|\bbun -e\s+["'`]/m,
  },
  { label: "{{spec_summary_15_lines}} placeholder", pattern: /\{\{spec_summary_15_lines\}\}/ },
];

function listMarkdown(directory: string): string[] {
  return readdirSync(join(REPO_ROOT, directory))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${directory}/${name}`);
}

const PINNED_FILES = ["commands/emet.md", ...PINNED_DIRECTORIES.flatMap(listMarkdown)].toSorted();

describe("prompt byte budget", () => {
  test("every prompt file has a pinned ceiling and every ceiling has a file", () => {
    expect(Object.keys(BYTE_CEILINGS).toSorted()).toEqual(PINNED_FILES);
  });

  for (const relativePath of PINNED_FILES) {
    test(`${relativePath} stays within its ceiling`, () => {
      const size = readFileSync(join(REPO_ROOT, relativePath)).byteLength;
      const ceiling = BYTE_CEILINGS[relativePath];
      expect(ceiling).toBeDefined();
      expect(size).toBeLessThanOrEqual(ceiling!);
    });
  }
});

describe("reference hard cap", () => {
  for (const relativePath of listMarkdown("emet/reference")) {
    test(`${relativePath} is at most ${REFERENCE_HARD_CAP_BYTES} bytes`, () => {
      const size = readFileSync(join(REPO_ROOT, relativePath)).byteLength;
      expect(size).toBeLessThanOrEqual(REFERENCE_HARD_CAP_BYTES);
    });
  }

  test("no ceiling for a reference file exceeds the hard cap", () => {
    for (const [relativePath, ceiling] of Object.entries(BYTE_CEILINGS)) {
      if (relativePath.startsWith("emet/reference/")) {
        expect(ceiling).toBeLessThanOrEqual(REFERENCE_HARD_CAP_BYTES);
      }
    }
  });
});

describe("retired phrases", () => {
  for (const relativePath of PINNED_FILES) {
    test(`${relativePath} has no retired phrase`, () => {
      const content = readFileSync(join(REPO_ROOT, relativePath), "utf8");
      const hits = BANNED_PHRASES.filter(({ pattern }) => pattern.test(content)).map(
        ({ label }) => label,
      );
      expect(hits).toEqual([]);
    });
  }

  test("the ban patterns still catch what they target", () => {
    const [inlineSnippet, placeholder] = BANNED_PHRASES;
    expect(inlineSnippet!.pattern.test("run bun -e \"import { reserve } from './claims'\"")).toBe(
      true,
    );
    expect(inlineSnippet!.pattern.test("```\nbun -e console.log(1)\n```")).toBe(true);
    expect(inlineSnippet!.pattern.test("never call it through an inline `bun -e` snippet")).toBe(
      false,
    );
    expect(placeholder!.pattern.test("{{spec_summary_15_lines}}")).toBe(true);
  });
});
