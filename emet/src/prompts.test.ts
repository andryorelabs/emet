import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { present } from "./present";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/**
 * Byte ceilings, measured on trunk after wave 4 plus ~4% headroom. Raising one
 * is a reviewed decision: edit the number here, in the same PR as the growth.
 */
const BYTE_CEILINGS: Readonly<Record<string, number>> = {
  "commands/doctor.md": 570,
  "commands/init.md": 570,
  "commands/run.md": 8800,
  "commands/setup.md": 1150,
  "emet/reference/incidents.md": 12950,
  "emet/reference/phases-1-5.md": 12050,
  "emet/reference/phases-6-7-dispatch.md": 16810,
  "emet/reference/phases-8-closeout.md": 17800,
  "emet/reference/phases-9-handoff.md": 7300,
  "emet/reference/reviewer-prompt.md": 3930,
  "emet/reference/tracker-github.md": 3790,
  "emet/reference/tracker-linear.md": 5300,
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

const PINNED_FILES = [
  ...listMarkdown("commands"),
  ...PINNED_DIRECTORIES.flatMap(listMarkdown),
].toSorted();

describe("prompt byte budget", () => {
  test("every prompt file has a pinned ceiling and every ceiling has a file", () => {
    expect(Object.keys(BYTE_CEILINGS).toSorted()).toEqual(PINNED_FILES);
  });

  for (const relativePath of PINNED_FILES) {
    test(`${relativePath} stays within its ceiling`, () => {
      const size = readFileSync(join(REPO_ROOT, relativePath)).byteLength;
      const ceiling = BYTE_CEILINGS[relativePath];
      expect(ceiling).toBeDefined();
      expect(size).toBeLessThanOrEqual(present(ceiling));
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
    expect(
      present(inlineSnippet).pattern.test("run bun -e \"import { reserve } from './claims'\""),
    ).toBe(true);
    expect(present(inlineSnippet).pattern.test("```\nbun -e console.log(1)\n```")).toBe(true);
    expect(
      present(inlineSnippet).pattern.test("never call it through an inline `bun -e` snippet"),
    ).toBe(false);
    expect(present(placeholder).pattern.test("{{spec_summary_15_lines}}")).toBe(true);
  });
});

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("browser verification prompts", () => {
  test("the reviewer prompt carries the Browser axis behind {{browser_verify}}", () => {
    const reviewer = read("emet/reference/reviewer-prompt.md");
    expect(reviewer).toContain("{{browser_verify}}");
    expect(reviewer).toContain("agent-browser skills get core");
    expect(reviewer).toContain("--session review-{{run_id}}");
    expect(reviewer).toContain("verification-gap");
  });

  test("the closeout fills {{browser_verify}} only on browserVerify.run: true", () => {
    const closeout = read("emet/reference/phases-8-closeout.md");
    expect(closeout).toContain("{{browser_verify}}");
    expect(closeout).toContain("browserVerify.run: true");
  });

  test("the worker prompt has the optional browser line", () => {
    const worker = read("emet/reference/worker-prompt.md");
    expect(worker).toContain("Optional:");
    expect(worker).toContain("--session <ticket>");
  });

  test("no prompt pins an agent-browser version", () => {
    for (const path of listMarkdown("emet/reference")) {
      expect(read(path)).not.toMatch(/agent-browser@/);
    }
  });
});
