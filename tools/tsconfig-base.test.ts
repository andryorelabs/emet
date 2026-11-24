import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

/** Whether `value` is a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a tsconfig file from the repository as a JSON object. */
function readTsconfig(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${relativePath} is not a JSON object`);
  }
  return parsed;
}

/** Returns the `compilerOptions` object of a parsed tsconfig, or an empty object. */
function compilerOptionsOf(tsconfig: Record<string, unknown>): Record<string, unknown> {
  const options = tsconfig.compilerOptions;
  return isRecord(options) ? options : {};
}

/** Returns the `extends` entries of a parsed tsconfig as a list. */
function extendsOf(tsconfig: Record<string, unknown>): unknown[] {
  const extended = tsconfig.extends;
  if (extended === undefined) {
    return [];
  }
  return Array.isArray(extended) ? extended : [extended];
}

const base = readTsconfig("tsconfig.base.json");
const baseOptions = compilerOptionsOf(base);

describe("tsconfig.base.json", () => {
  test("holds compilerOptions only", () => {
    expect(Object.keys(base)).toEqual(["compilerOptions"]);
  });

  test.each([
    ["tsconfig.json", "./tsconfig.base.json"],
    ["apps/site/tsconfig.json", "../../tsconfig.base.json"],
  ])("%s extends it last so no base flag is overridden by a preset", (relativePath, basePath) => {
    expect(extendsOf(readTsconfig(relativePath)).at(-1)).toBe(basePath);
  });

  test.each(["tsconfig.json", "apps/site/tsconfig.json"])(
    "%s does not loosen a base flag",
    (relativePath) => {
      const options = compilerOptionsOf(readTsconfig(relativePath));
      const overridden = Object.keys(baseOptions).filter(
        (flag) => flag in options && options[flag] !== baseOptions[flag],
      );
      expect(overridden).toEqual([]);
    },
  );

  test("emet/tsconfig.json carries every base flag itself, because `emet self install --from` copies only emet/", () => {
    const emetOptions = compilerOptionsOf(readTsconfig("emet/tsconfig.json"));
    const drifted = Object.entries(baseOptions)
      .filter(([flag, value]) => emetOptions[flag] !== value)
      .map(([flag, value]) => ({ flag, base: value, emet: emetOptions[flag] }));
    expect(drifted).toEqual([]);
  });

  test("the root include covers the root configs and the Claude hooks", () => {
    const include = readTsconfig("tsconfig.json").include;
    expect(include).toEqual(expect.arrayContaining(["*.ts", "*.mts", ".claude/hooks/*.ts"]));
  });
});
