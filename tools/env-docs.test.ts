import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { ENV_VARS } from "../emet/src/env";

const REPO_ROOT = join(import.meta.dir, "..");
const SOURCE_DIRECTORY = join(REPO_ROOT, "emet", "src");
const ENV_MODULE = join(SOURCE_DIRECTORY, "env.ts");
const TEST_PRELOAD_MODULE = join(SOURCE_DIRECTORY, "test-preload.ts");
const DOCS_FILE = join(REPO_ROOT, "docs", "reference", "configuration.md");
const DIRECT_ENV_ACCESS = /\b(?:process|Bun)\.env\b/;
const DIRECT_ENV_PROPERTY = /\benv\.[A-Z][A-Z0-9_]*\b/;
const TABLE_HEADING = "## Environment variables";

/** Lists every non-test TypeScript source file under `directory`. */
function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [fullPath] : [];
  });
}

/** The variable names in the first column of the docs table. */
function documentedNames(): string[] {
  const text = readFileSync(DOCS_FILE, "utf8");
  const start = text.indexOf(TABLE_HEADING);
  if (start === -1) return [];
  const section = text.slice(start + TABLE_HEADING.length).split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

describe("environment variables", () => {
  test("only env.ts reads process.env or Bun.env", () => {
    const offenders = listSourceFiles(SOURCE_DIRECTORY)
      .filter((file) => file !== ENV_MODULE && file !== TEST_PRELOAD_MODULE)
      .filter((file) => DIRECT_ENV_ACCESS.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file));
    expect(offenders).toEqual([]);
  });

  test("no source file reads a variable as a property of an env object", () => {
    const offenders = listSourceFiles(SOURCE_DIRECTORY)
      .filter((file) => file !== ENV_MODULE && file !== TEST_PRELOAD_MODULE)
      .filter((file) => DIRECT_ENV_PROPERTY.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file));
    expect(offenders).toEqual([]);
  });

  test("every variable in ENV_VARS is documented", () => {
    const documented = new Set(documentedNames());
    const missing = ENV_VARS.map((variable) => variable.name).filter(
      (name) => !documented.has(name),
    );
    expect(missing).toEqual([]);
  });

  test("every documented variable is in ENV_VARS", () => {
    const known = new Set<string>(ENV_VARS.map((variable) => variable.name));
    const unknown = documentedNames().filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });

  test("every legacy fallback is documented beside its variable", () => {
    const text = readFileSync(DOCS_FILE, "utf8");
    const missing = ENV_VARS.flatMap((variable) =>
      "legacy" in variable && !text.includes(`\`${variable.legacy}\``) ? [variable.legacy] : [],
    );
    expect(missing).toEqual([]);
  });
});
