import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { TOOLCHAIN } from "./toolchain.ts";

const repoRoot = path.join(import.meta.dir, "..");

/** Reads a repository file as text. */
function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/** Whether `value` is a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a JSON object from the repository, failing when it is not an object. */
function readJson(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readText(relativePath));
  if (!isRecord(parsed)) {
    throw new Error(`${relativePath} is not a JSON object`);
  }
  return parsed;
}

/** Follows `keys` into a parsed JSON object and returns the string found there, if any. */
function readJsonString(relativePath: string, keys: readonly string[]): string | undefined {
  let current: unknown = readJson(relativePath);
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

/** Returns the first capture group of `pattern` in a repository file, if it matches. */
function readCapture(relativePath: string, pattern: RegExp): string | undefined {
  return pattern.exec(readText(relativePath))?.[1];
}

/** One place in the repo that carries a toolchain pin. */
interface PinSource {
  readonly pin: string;
  readonly source: string;
  readonly read: () => string | undefined;
}

const rootDevDependency = (pin: string): PinSource => ({
  pin,
  source: "package.json devDependencies",
  read: () => readJsonString("package.json", ["devDependencies", pin]),
});

const pinSources: readonly PinSource[] = [
  rootDevDependency("oxlint"),
  rootDevDependency("@oxlint/plugins"),
  rootDevDependency("oxfmt"),
  rootDevDependency("oxlint-tsgolint"),
  rootDevDependency("typescript7"),
  {
    pin: "typescript",
    source: "emet/package.json devDependencies",
    read: () => readJsonString("emet/package.json", ["devDependencies", "typescript"]),
  },
  {
    pin: "bun",
    source: "package.json packageManager",
    read: () => readJsonString("package.json", ["packageManager"])?.replace(/^bun@/, ""),
  },
  {
    pin: "bun",
    source: "package.json engines.bun",
    read: () => readJsonString("package.json", ["engines", "bun"]),
  },
  {
    pin: "@types/bun",
    source: "package.json workspaces.catalog",
    read: () => readJsonString("package.json", ["workspaces", "catalog", "@types/bun"]),
  },
  {
    pin: "@types/bun",
    source: "emet/package.json devDependencies",
    read: () => readJsonString("emet/package.json", ["devDependencies", "@types/bun"]),
  },
  {
    pin: "node",
    source: ".node-version",
    read: () => readText(".node-version").trim(),
  },
  {
    pin: "actionlint",
    source: ".github/workflows/lint-workflows.yml",
    read: () => readCapture(".github/workflows/lint-workflows.yml", /ACTIONLINT_VERSION: (\S+)/),
  },
  {
    pin: "zizmor",
    source: ".github/workflows/lint-workflows.yml",
    read: () =>
      readCapture(
        ".github/workflows/lint-workflows.yml",
        /zizmorcore\/zizmor-action@[^\n]+\n\s+with:\n\s+version: v(\S+)/,
      ),
  },
  {
    pin: "lycheeverse/lychee-action",
    source: ".github/workflows/lint-docs.yml",
    read: () => readCapture(".github/workflows/lint-docs.yml", /lycheeverse\/lychee-action@(\S+)/),
  },
];

describe("toolchain pins match tools/toolchain.ts", () => {
  test.each(pinSources.map((entry) => [`${entry.pin} in ${entry.source}`, entry] as const))(
    "%s",
    (_label, entry) => {
      expect({ pin: entry.pin, source: entry.source, actual: entry.read() }).toEqual({
        pin: entry.pin,
        source: entry.source,
        actual: TOOLCHAIN[entry.pin],
      });
    },
  );

  test("every pin in the table is checked against at least one source", () => {
    const checked = new Set(pinSources.map((entry) => entry.pin));
    const unchecked = Object.keys(TOOLCHAIN).filter((pin) => !checked.has(pin));
    expect(unchecked).toEqual([]);
  });

  test("every source names a pin from the table", () => {
    const unknown = pinSources.filter((entry) => TOOLCHAIN[entry.pin] === undefined);
    expect(unknown.map((entry) => entry.pin)).toEqual([]);
  });
});
