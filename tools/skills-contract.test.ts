import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SKILLS_CONTRACT } from "../emet/src/skills";

const REPO_ROOT = join(import.meta.dir, "..");

/**
 * Every skill in the mattpocock-skills 1.3.1 catalog. A prompt that names one
 * of these as a backticked token must have it in the contract.
 */
const MATTPOCOCK_CATALOG = [
  "ask-matt",
  "code-review",
  "codebase-design",
  "diagnosing-bugs",
  "domain-modeling",
  "grill-me",
  "grill-with-docs",
  "grilling",
  "handoff",
  "implement",
  "implement-spec",
  "improve-codebase-architecture",
  "pr",
  "prototype",
  "research",
  "retro",
  "setup-matt-pocock-skills",
  "tdd",
  "teach",
  "to-questionnaire",
  "to-spec",
  "to-tickets",
  "triage",
  "wait-what",
  "wayfinder",
  "wizard",
  "writing-for-agents",
];

function installedPromptFiles(): string[] {
  const files = [join(REPO_ROOT, "commands", "emet.md")];
  for (const directory of ["agents", join("emet", "reference")]) {
    for (const entry of readdirSync(join(REPO_ROOT, directory))) {
      if (entry.endsWith(".md")) files.push(join(REPO_ROOT, directory, entry));
    }
  }
  return files;
}

function namedSkills(text: string): Set<string> {
  const names = new Set<string>();
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => /skill/i.test(paragraph));
  for (const paragraph of paragraphs) {
    for (const match of paragraph.matchAll(/`([a-z][a-z-]*)`/g)) {
      const token = match[1];
      if (token !== undefined && MATTPOCOCK_CATALOG.includes(token)) names.add(token);
    }
  }
  for (const match of text.matchAll(/mattpocock-skills\/[^/\s]+\/skills\/[^/\s]+\/([a-z-]+)\//g)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return names;
}

describe("skills contract", () => {
  test("every skill named in installed prompts is in the contract", () => {
    const contract = new Set(SKILLS_CONTRACT.names);
    const uncovered: string[] = [];
    for (const file of installedPromptFiles()) {
      for (const name of namedSkills(readFileSync(file, "utf8"))) {
        if (!contract.has(name)) uncovered.push(`${file}: ${name}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  test("the contract only lists catalog skills", () => {
    for (const name of SKILLS_CONTRACT.names) {
      expect(MATTPOCOCK_CATALOG).toContain(name);
    }
  });
});
