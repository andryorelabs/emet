import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");

const THIS_FILE = "tools/stale-names.test.ts";

const STALE_NAME = /claude-forge|andryore-starter|(?<!to )\bforge\b/i;

/**
 * Tracked paths and path prefixes that may still carry a stale product name.
 * A trailing slash marks a directory prefix. History lives in the ADRs, the
 * CHANGELOG and the research notes; every other entry is part of the legacy
 * compatibility layer of ADR-0015 (the legacy names `emet` still reads, the
 * code that reads them, and the tests and docs that describe them).
 */
export const STALE_NAME_ALLOW_LIST: readonly string[] = [
  "docs/adr/",
  "CHANGELOG.md",
  "docs/research/",
  "install.sh",
  "emet/",
  "codex/skills/run/references/incidents.md",
  "docs/brand/",
  ".claude/hooks/rm-guard.ts",
  ".claude/hooks/rm-guard.test.ts",
  "tools/install.test.ts",
  "tools/workflows-invariants.test.ts",
  "tools/plugin.test.ts",
  "tools/codex-e2e.test.ts",
  "tools/fixtures/claude-install-snapshot.json",
  "GLOSSARY.md",
  "docs/troubleshooting.md",
  "docs/architecture.md",
  "docs/security.md",
  "apps/site/src/content/translations/",
];

/** Whether a path is covered by one allow-list entry. */
function matchesEntry(file: string, entry: string): boolean {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

/** Whether a tracked path is covered by the allow-list. */
export function isAllowed(file: string): boolean {
  return STALE_NAME_ALLOW_LIST.some((entry) => matchesEntry(file, entry));
}

/** Lists tracked files. */
function trackedFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: REPO_ROOT });
  return new TextDecoder()
    .decode(result.stdout)
    .split("\0")
    .filter((file) => file.length > 0);
}

/** Finds `file:line` locations that carry a stale name in a text file. */
function staleLocations(file: string): string[] {
  let content: string;
  try {
    content = readFileSync(path.join(REPO_ROOT, file), "utf8");
  } catch {
    return [];
  }
  if (content.includes("\0")) return [];
  return content
    .split("\n")
    .flatMap((line, index) => (STALE_NAME.test(line) ? [`${file}:${index + 1}`] : []));
}

describe("stale product names", () => {
  test("appear only in allow-listed paths", () => {
    const offenders = trackedFiles()
      .filter((file) => file !== THIS_FILE && !isAllowed(file))
      .flatMap(staleLocations);
    expect(offenders).toEqual([]);
  });

  test("every allow-list entry still covers a stale name", () => {
    const files = trackedFiles();
    const unused = STALE_NAME_ALLOW_LIST.filter(
      (entry) =>
        !files.some((file) => matchesEntry(file, entry) && staleLocations(file).length > 0),
    );
    expect(unused).toEqual([]);
  });

  test("the pattern matches each stale name", () => {
    for (const sample of ["claude-forge", "andryore-starter", "run forge init"]) {
      expect(STALE_NAME.test(sample)).toBe(true);
    }
    expect(STALE_NAME.test("forged approval")).toBe(false);
    expect(STALE_NAME.test("a model trying to forge an approval")).toBe(false);
  });
});
