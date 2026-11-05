import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

/** Reads a UTF-8 file relative to the repository root. */
function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Whether `value` is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads every label name declared in `.github/labels.yml`. */
function declaredLabelNames(): string[] {
  const labels: unknown = Bun.YAML.parse(readText(".github/labels.yml"));
  if (!Array.isArray(labels)) throw new Error("labels.yml must be a list");
  const entries: unknown[] = labels;
  return entries.map((label): string => {
    const name = isRecord(label) ? label["name"] : undefined;
    if (typeof name !== "string") {
      throw new Error("every labels.yml entry needs a string name");
    }
    return name;
  });
}

const TRIAGE_LABELS = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
];

/** Collects every label name the emet tracker config depends on. */
function requiredForgeLabels(): string[] {
  const config: unknown = JSON.parse(readText("emet.config.json"));
  const tracker = isRecord(config) ? config["tracker"] : undefined;
  const github = isRecord(tracker) ? tracker["github"] : undefined;
  const stateLabels = isRecord(github) ? github["stateLabels"] : undefined;
  if (!isRecord(stateLabels)) throw new Error("emet.config.json needs tracker.github.stateLabels");
  return [...TRIAGE_LABELS, ...Object.values(stateLabels).map(String)];
}

test("labels.yml declares every label emet.config.json depends on", () => {
  const declared = new Set(declaredLabelNames());
  const missing = requiredForgeLabels().filter((name) => !declared.has(name));
  expect(missing).toEqual([]);
});

test("labels.yml has no duplicate label names", () => {
  const declared = declaredLabelNames();
  expect(new Set(declared).size).toBe(declared.length);
});
