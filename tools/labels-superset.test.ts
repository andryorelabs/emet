import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

/** Reads a UTF-8 file relative to the repository root. */
function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Reads every label name declared in `.github/labels.yml`. */
function declaredLabelNames(): string[] {
  const labels: unknown = Bun.YAML.parse(readText(".github/labels.yml"));
  if (!Array.isArray(labels)) throw new Error("labels.yml must be a list");
  return labels.map((label): string => {
    if (typeof label !== "object" || label === null || typeof label.name !== "string") {
      throw new Error("every labels.yml entry needs a string name");
    }
    return label.name;
  });
}

/** Collects every label name the forge tracker config depends on. */
function requiredForgeLabels(): string[] {
  const config: {
    tracker: { triageLabels: string[]; github: { stateLabels: Record<string, string> } };
  } = JSON.parse(readText("forge.config.json"));
  return [...config.tracker.triageLabels, ...Object.values(config.tracker.github.stateLabels)];
}

test("labels.yml declares every label forge.config.json depends on", () => {
  const declared = new Set(declaredLabelNames());
  const missing = requiredForgeLabels().filter((name) => !declared.has(name));
  expect(missing).toEqual([]);
});

test("labels.yml has no duplicate label names", () => {
  const declared = declaredLabelNames();
  expect(new Set(declared).size).toBe(declared.length);
});
