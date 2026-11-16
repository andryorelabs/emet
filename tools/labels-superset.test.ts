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

/** Parses a labels.yml document into its label names. */
export function labelNames(yaml: string): readonly string[] {
  const labels: unknown = Bun.YAML.parse(yaml);
  if (!Array.isArray(labels)) throw new Error("labels.yml must be a list");
  const entries: unknown[] = labels;
  return entries.map((label): string => {
    const name = isRecord(label) ? label.name : undefined;
    if (typeof name !== "string") {
      throw new Error("every labels.yml entry needs a string name");
    }
    return name;
  });
}

/** Reads every label name declared in `.github/labels.yml`. */
function declaredLabelNames(): readonly string[] {
  return labelNames(readText(".github/labels.yml"));
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
  const tracker = isRecord(config) ? config.tracker : undefined;
  const github = isRecord(tracker) ? tracker.github : undefined;
  const stateLabels = isRecord(github) ? github.stateLabels : undefined;
  if (!isRecord(stateLabels)) throw new Error("emet.config.json needs tracker.github.stateLabels");
  return [...TRIAGE_LABELS, ...Object.values(stateLabels).map(String)];
}

test("labels.yml declares every label emet.config.json depends on", () => {
  const declared = new Set(declaredLabelNames());
  const missing = requiredForgeLabels().filter((name) => !declared.has(name));
  expect(missing).toEqual([]);
});

const S10_LABELS = [
  ...TRIAGE_LABELS,
  "status:todo",
  "status:in-progress",
  "status:in-review",
  "Type: Bug",
  "Type: Feature",
  "Type: Enhancement",
  "Type: Docs",
  "Type: Security",
  "Status: Needs Info",
  "Status: Needs Decision",
  "Status: Blocked",
  "Status: In Progress",
  "Priority: Critical",
  "Priority: High",
  "Priority: Medium",
  "Priority: Low",
  "Resolution: Duplicate",
  "Resolution: Won't Fix",
  "Resolution: Invalid",
  "dependencies",
  "github-actions",
  "security",
  "breaking-change",
  "good first issue",
  "help wanted",
];

test("labels.yml holds exactly the S10 set plus Area labels", () => {
  const declared = declaredLabelNames();
  const areaLabels = declared.filter((name) => name.startsWith("Area: "));
  expect(areaLabels.length).toBeGreaterThan(0);
  const rest = declared.filter((name) => !name.startsWith("Area: "));
  expect([...rest].toSorted()).toEqual([...S10_LABELS].toSorted());
});

test("emet.config.json priorityLabels map to declared Priority labels", () => {
  const config: unknown = JSON.parse(readText("emet.config.json"));
  const tracker = isRecord(config) ? config.tracker : undefined;
  const github = isRecord(tracker) ? tracker.github : undefined;
  const priorityLabels = isRecord(github) ? github.priorityLabels : undefined;
  if (!isRecord(priorityLabels)) throw new Error("priorityLabels must be an object");
  const declared = new Set(declaredLabelNames());
  const mapped = Object.values(priorityLabels).map(String);
  expect(mapped.length).toBeGreaterThan(0);
  expect(mapped.filter((name) => !declared.has(name))).toEqual([]);
});

test("labels.yml has no duplicate label names", () => {
  const declared = declaredLabelNames();
  expect(new Set(declared).size).toBe(declared.length);
});
