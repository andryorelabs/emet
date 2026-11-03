import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

/** Reads a UTF-8 file relative to the repository root. */
function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Collects every label name the forge tracker config depends on. */
function requiredForgeLabels(): string[] {
  const config = JSON.parse(readText("forge.config.json")) as {
    tracker: { triageLabels: string[]; github: { stateLabels: Record<string, string> } };
  };
  return [...config.tracker.triageLabels, ...Object.values(config.tracker.github.stateLabels)];
}

test("labels.yml declares every label forge.config.json depends on", () => {
  const declared = (Bun.YAML.parse(readText(".github/labels.yml")) as { name: string }[]).map(
    (label) => label.name,
  );
  const missing = requiredForgeLabels().filter((name) => !declared.includes(name));
  expect(missing).toEqual([]);
});

test("labels.yml has no duplicate label names", () => {
  const declared = (Bun.YAML.parse(readText(".github/labels.yml")) as { name: string }[]).map(
    (label) => label.name,
  );
  expect(new Set(declared).size).toBe(declared.length);
});
