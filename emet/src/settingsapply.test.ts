import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RECOMMENDED_CLAUDE_SETTINGS,
  applyClaudeSettings,
  isRecommendedApplied,
} from "./settingsapply";

const deps = { now: () => new Date("2026-11-19T03:04:05.678Z") };
let directory = "";
let settingsPath = "";

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-settings-"));
  settingsPath = path.join(directory, "nested", "settings.json");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function seed(content: string): void {
  const parent = path.dirname(settingsPath);
  mkdirSync(parent, { recursive: true });
  writeFileSync(settingsPath, content);
}

describe("applyClaudeSettings", () => {
  test("backs up an existing file before changing it and keeps other keys", () => {
    seed(
      JSON.stringify({ theme: "dark", permissions: { allow: ["Bash(ls)"], deny: ["Read(x)"] } }),
    );
    const { backupPath } = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    expect(backupPath).toBe(`${settingsPath}.bak-2026-11-19T03-04-05-678Z`);
    expect(readFileSync(backupPath, "utf8")).not.toContain("opusplan");
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      theme: "dark",
      model: "opusplan",
      permissions: { allow: ["Bash(ls)"], deny: ["Read(x)", ...RECOMMENDED_CLAUDE_SETTINGS.deny] },
    });
  });

  test("creates the file without a backup when none exists", () => {
    const { backupPath } = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    expect(backupPath).toBe("");
    expect(readdirSync(path.dirname(settingsPath))).toEqual(["settings.json"]);
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(true);
  });

  test("does not duplicate deny rules when applied twice", () => {
    applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      model: "opusplan",
      permissions: { deny: [...RECOMMENDED_CLAUDE_SETTINGS.deny] },
    });
  });

  test("refuses a settings file that is not a JSON object and leaves it alone", () => {
    seed("[]");
    expect(() => applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps)).toThrow(
      "not a JSON object",
    );
    expect(readFileSync(settingsPath, "utf8")).toBe("[]");
    expect(existsSync(`${settingsPath}.bak-2026-11-19T03-04-05-678Z`)).toBe(false);
  });
});

describe("isRecommendedApplied", () => {
  test("is false for a missing file, invalid JSON, a wrong model and missing rules", () => {
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(false);
    seed("{nope");
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(false);
    seed(
      JSON.stringify({ model: "sonnet", permissions: { deny: RECOMMENDED_CLAUDE_SETTINGS.deny } }),
    );
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(false);
    seed(JSON.stringify({ model: "opusplan", permissions: { deny: [1, "Read(x)"] } }));
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(false);
    seed(JSON.stringify({ model: "opusplan", permissions: "x" }));
    expect(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)).toBe(false);
  });
});
