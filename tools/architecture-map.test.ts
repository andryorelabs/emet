import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIRECTORY = join(import.meta.dir, "..", "emet", "src");
const ARCHITECTURE_PAGE = join(import.meta.dir, "..", "docs", "concepts", "architecture.md");

/**
 * Lists the non-test modules of `emet/src`, excluding generated files.
 */
function listModules(): string[] {
  return readdirSync(SOURCE_DIRECTORY)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts"))
    .filter((name) => !name.endsWith(".generated.ts"))
    .toSorted();
}

/**
 * Finds the modules that the page does not name in backticks.
 * @param page The architecture page markdown.
 * @param modules The module file names.
 * @returns The module names missing from the page.
 */
function findMissingModules(page: string, modules: readonly string[]): string[] {
  return modules.filter((moduleName) => !page.includes(`\`${moduleName}\``));
}

describe("architecture map", () => {
  const modules = listModules();

  test("finds the modules of emet/src", () => {
    expect(modules.length).toBeGreaterThan(50);
  });

  test("every non-test module of emet/src is named on the architecture page", () => {
    const page = readFileSync(ARCHITECTURE_PAGE, "utf8");
    expect(findMissingModules(page, modules)).toEqual([]);
  });

  test("fails when a module is removed from the page", () => {
    const page = readFileSync(ARCHITECTURE_PAGE, "utf8");
    const withoutGuard = page.replaceAll("`guard.ts`", "");
    expect(findMissingModules(withoutGuard, modules)).toContain("guard.ts");
  });
});
