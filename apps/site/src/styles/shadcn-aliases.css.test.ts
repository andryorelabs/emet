import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const STYLES_DIRECTORY = import.meta.dir;

function readStylesheet(name: string): string {
  return readFileSync(join(STYLES_DIRECTORY, name), "utf8");
}

/**
 * The `:root` block that declares the shadcn aliases, as its declarations.
 * @param css - The stylesheet source.
 * @returns The declarations of the block that defines `--background`.
 */
function readAliasDeclarations(css: string): string[] {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1] ?? "");
  const block = blocks.find((candidate) => candidate.includes("--background:"));
  expect(block).toBeDefined();
  return (block ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0);
}

describe("shadcn aliases of the brand tokens", () => {
  const globalAliases = readAliasDeclarations(readStylesheet("global.css"));
  const docsAliases = readAliasDeclarations(readStylesheet("docs.css"));
  const tokens = readStylesheet("tokens.css");

  test("global.css and docs.css declare the same aliases", () => {
    expect(docsAliases).toEqual(globalAliases);
  });

  test("every alias that points at a token names a token tokens.css declares", () => {
    const targets = globalAliases
      .map((declaration) => /var\((--[\w-]+)\)/.exec(declaration)?.[1])
      .filter((target): target is string => target !== undefined);
    expect(targets.length).toBeGreaterThan(0);
    const missing = targets.filter((target) => !tokens.includes(`${target}:`));
    expect(missing).toEqual([]);
  });
});
