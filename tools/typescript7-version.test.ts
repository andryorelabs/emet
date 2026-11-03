import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

/** Reads and parses a JSON file relative to the repository root. */
function readJson(relativePath: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = JSON.parse(
    readFileSync(join(repoRoot, relativePath), "utf8"),
  );
  return parsed;
}

/** Reads the root `package.json` scripts as command strings. */
function readRootScripts(): Record<string, string> {
  const scripts = readJson("package.json")["scripts"];
  if (typeof scripts !== "object" || scripts === null) {
    throw new Error("package.json has no scripts object");
  }
  return Object.fromEntries(
    Object.entries(scripts).map(([name, command]) => [name, String(command)]),
  );
}

test("the typescript7 alias resolves to a 7.x compiler", () => {
  const manifest = readJson("node_modules/typescript7/package.json");
  expect(String(manifest["version"])).toMatch(/^7\./);
});

test("no root script calls bare tsc", () => {
  const scripts = readRootScripts();
  for (const [name, command] of Object.entries(scripts)) {
    const callsBareTsc = command
      .split(/&&|\|\||;|\|/)
      .some((segment) => /^\s*(?:bunx\s+|npx\s+)?tsc(?:\s|$)/.test(segment));
    expect({ name, callsBareTsc }).toEqual({ name, callsBareTsc: false });
  }
});
