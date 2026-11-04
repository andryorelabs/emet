import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DOCS_DIRECTORY = join(import.meta.dir, "..", "docs");
const INDEX_FILE = join(DOCS_DIRECTORY, "README.md");

/**
 * Lists every markdown file under `directory` as a path relative to `docs/`,
 * with forward slashes.
 */
function listMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    return entry.name.endsWith(".md")
      ? [relative(DOCS_DIRECTORY, fullPath).replaceAll("\\", "/")]
      : [];
  });
}

/**
 * Whether a file needs its own index row. ADR files are indexed through
 * `docs/adr/README.md`, which `tools/adr-invariants.test.ts` keeps in sync.
 */
function needsIndexEntry(relativePath: string): boolean {
  return relativePath === "adr/README.md" || !relativePath.startsWith("adr/");
}

describe("docs index", () => {
  const indexContent = readFileSync(INDEX_FILE, "utf8");

  test("every doc under docs/ has an entry in docs/README.md", () => {
    const missing = listMarkdownFiles(DOCS_DIRECTORY)
      .filter((relativePath) => relativePath !== "README.md")
      .filter(needsIndexEntry)
      .filter((relativePath) => !indexContent.includes(`](${relativePath})`));
    expect(missing).toEqual([]);
  });

  test("the index links the root docs it promises", () => {
    for (const target of [
      "../README.md",
      "../CHANGELOG.md",
      "../GLOSSARY.md",
      "../AGENTS.md",
      "../emet/AGENTS.md",
    ]) {
      expect(indexContent).toContain(`](${target})`);
    }
  });
});
