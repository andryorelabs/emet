import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const sourceDirectory = path.resolve(import.meta.dir, "../forge/src");

/** Source modules with no colocated test, each with the reason it is exempt. */
const EXEMPTIONS: Readonly<Record<string, string>> = {};

function sourceModules(): string[] {
  return readdirSync(sourceDirectory)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .toSorted();
}

describe("forge/src coverage manifest", () => {
  test("every module has a colocated test or a reasoned exemption", () => {
    const uncovered = sourceModules().filter((file) => {
      const colocated = path.join(sourceDirectory, file.replace(/\.ts$/, ".test.ts"));
      return !existsSync(colocated) && !(file in EXEMPTIONS);
    });
    expect(uncovered).toEqual([]);
  });

  test("every exemption names an existing, untested module and gives a reason", () => {
    const modules = new Set(sourceModules());
    for (const [file, reason] of Object.entries(EXEMPTIONS)) {
      expect(modules.has(file)).toBe(true);
      expect(existsSync(path.join(sourceDirectory, file.replace(/\.ts$/, ".test.ts")))).toBe(false);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
