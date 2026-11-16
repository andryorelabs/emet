import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { labelNames } from "./labels-superset.test.ts";

const repoRoot = join(import.meta.dir, "..");
const templateDir = join(repoRoot, ".github", "ISSUE_TEMPLATE");

/** Whether `value` is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads the labels an issue form applies. */
function formLabels(fileName: string): readonly string[] {
  const form: unknown = Bun.YAML.parse(readFileSync(join(templateDir, fileName), "utf8"));
  const labels = isRecord(form) ? form.labels : undefined;
  if (!Array.isArray(labels)) return [];
  const entries: unknown[] = labels;
  return entries.map(String);
}

const declared = new Set(labelNames(readFileSync(join(repoRoot, ".github", "labels.yml"), "utf8")));
const formFiles = readdirSync(templateDir).filter((name) => /^\d.*\.yml$/.test(name));

test("there are issue forms to check", () => {
  expect(formFiles.length).toBeGreaterThan(0);
});

for (const fileName of formFiles) {
  test(`${fileName} applies only labels declared in labels.yml`, () => {
    expect(formLabels(fileName).filter((name) => !declared.has(name))).toEqual([]);
  });
}

test("config.yml has a Support/Docs contact link", () => {
  const config: unknown = Bun.YAML.parse(readFileSync(join(templateDir, "config.yml"), "utf8"));
  const links = isRecord(config) ? config.contact_links : undefined;
  if (!Array.isArray(links)) throw new Error("config.yml needs contact_links");
  const entries: unknown[] = links;
  const names = entries.map((link) => (isRecord(link) ? String(link.name) : ""));
  expect(names.some((name) => /support/i.test(name) && /docs/i.test(name))).toBe(true);
});

test(".gitattributes marks bun.lock and skills-lock.json as linguist-generated", () => {
  const lines = readFileSync(join(repoRoot, ".gitattributes"), "utf8").split("\n");
  expect(lines).toContain("bun.lock linguist-generated");
  expect(lines).toContain("skills-lock.json linguist-generated");
});
