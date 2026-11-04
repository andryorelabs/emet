import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const PLUGIN_PROMPT_FILES = [
  "commands/run.md",
  ...readdirSync(join(REPO_ROOT, "agents")).map((name) => `agents/${name}`),
  ...readdirSync(join(REPO_ROOT, "emet", "reference"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `emet/reference/${name}`),
];

describe("plugin-form prompt references", () => {
  for (const file of PLUGIN_PROMPT_FILES) {
    const content = readFileSync(join(REPO_ROOT, file), "utf8");

    test(`${file} hardcodes no install path`, () => {
      expect(content).not.toContain("~/.claude/forge");
      expect(content).not.toContain("plugins/cache");
    });

    test(`${file} dispatches only plugin-namespaced agents`, () => {
      expect(content).not.toMatch(/subagent_type:\s*"forge-(worker|reviewer)"/);
    });

    test(`${file} has no bare reference/ pointers`, () => {
      expect(content).not.toMatch(/`reference\//);
    });
  }
});
