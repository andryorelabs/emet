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
  revertClaudeSettings,
  type ClaudeSettingsUndo,
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
    const { backupPath, previousModel, addedDeny } = applyClaudeSettings(
      settingsPath,
      RECOMMENDED_CLAUDE_SETTINGS,
      deps,
    );
    expect(backupPath).toBe(`${settingsPath}.bak-2026-11-19T03-04-05-678Z`);
    expect(previousModel).toBeNull();
    expect(addedDeny).toEqual([...RECOMMENDED_CLAUDE_SETTINGS.deny]);
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

describe("applyClaudeSettings records", () => {
  test("the previous model and exactly the deny rules that were missing", () => {
    const [present, ...missing] = RECOMMENDED_CLAUDE_SETTINGS.deny;
    seed(JSON.stringify({ model: "sonnet", permissions: { deny: [present] } }));
    const { previousModel, addedDeny } = applyClaudeSettings(
      settingsPath,
      RECOMMENDED_CLAUDE_SETTINGS,
      deps,
    );
    expect(previousModel).toBe("sonnet");
    expect(addedDeny).toEqual(missing);
    expect(addedDeny).toHaveLength(3);
  });

  test("nothing added on a second apply", () => {
    applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    const second = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
    expect(second.previousModel).toBe("opusplan");
    expect(second.addedDeny).toEqual([]);
  });
});

const revertDeps = { now: () => new Date("2026-11-21T00:00:00.000Z") };
const revertBackup = (): string => `${settingsPath}.bak-2026-11-21T00-00-00-000Z`;

function applyAndRecord(): ClaudeSettingsUndo {
  const applied = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, deps);
  return {
    kind: "claude-settings",
    settingsPath,
    setModel: RECOMMENDED_CLAUDE_SETTINGS.model,
    ...applied,
  };
}

function readJson(): unknown {
  return JSON.parse(readFileSync(settingsPath, "utf8"));
}

describe("revertClaudeSettings", () => {
  test("restores the previous model, keeps user rules and backs up first", () => {
    seed(
      JSON.stringify({
        model: "sonnet",
        theme: "dark",
        permissions: { deny: ["Read(./secrets)"] },
      }),
    );
    const record = applyAndRecord();
    const applied = readFileSync(settingsPath, "utf8");
    expect(revertClaudeSettings(settingsPath, record, revertDeps)).toEqual({ warnings: [] });
    expect(readJson()).toEqual({
      model: "sonnet",
      theme: "dark",
      permissions: { deny: ["Read(./secrets)"] },
    });
    expect(readFileSync(revertBackup(), "utf8")).toBe(applied);
  });

  test("deletes the model and emptied permissions when there were none", () => {
    seed(JSON.stringify({ theme: "dark" }));
    const record = applyAndRecord();
    revertClaudeSettings(settingsPath, record, revertDeps);
    expect(readJson()).toEqual({ theme: "dark" });
  });

  test("keeps other permission keys when the deny list empties", () => {
    seed(JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }));
    const record = applyAndRecord();
    revertClaudeSettings(settingsPath, record, revertDeps);
    expect(readJson()).toEqual({ permissions: { allow: ["Bash(ls)"] } });
  });

  test("keeps a model the user changed after setup and warns", () => {
    seed(JSON.stringify({ model: "sonnet" }));
    const record = applyAndRecord();
    seed(
      JSON.stringify({
        model: "haiku",
        permissions: { deny: [...RECOMMENDED_CLAUDE_SETTINGS.deny, 7] },
      }),
    );
    const { warnings } = revertClaudeSettings(settingsPath, record, revertDeps);
    expect(warnings).toEqual([
      `${settingsPath}: model is "haiku", not "opusplan" as setup set it; keeping it`,
    ]);
    expect(readJson()).toEqual({ model: "haiku", permissions: { deny: [7] } });
  });

  test("never removes a deny rule the user already had", () => {
    const [present] = RECOMMENDED_CLAUDE_SETTINGS.deny;
    seed(JSON.stringify({ permissions: { deny: [present] } }));
    const record = applyAndRecord();
    revertClaudeSettings(settingsPath, record, revertDeps);
    expect(readJson()).toEqual({ permissions: { deny: [present] } });
  });

  test("leaves odd permissions values alone", () => {
    seed("{}");
    const record = applyAndRecord();
    seed(JSON.stringify({ model: "opusplan", permissions: { deny: "x" } }));
    revertClaudeSettings(settingsPath, record, revertDeps);
    expect(readJson()).toEqual({ permissions: { deny: "x" } });
    seed(JSON.stringify({ model: "opusplan", permissions: ["x"] }));
    revertClaudeSettings(settingsPath, record, revertDeps);
    expect(readJson()).toEqual({ permissions: ["x"] });
  });

  test("warns and writes nothing when the file is missing", () => {
    seed("{}");
    const record = applyAndRecord();
    rmSync(settingsPath);
    expect(revertClaudeSettings(settingsPath, record, revertDeps).warnings).toEqual([
      `${settingsPath} does not exist; nothing to revert`,
    ]);
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("fails with the path on an unreadable file and changes nothing", () => {
    seed("{}");
    const record = applyAndRecord();
    seed("{nope");
    expect(() => revertClaudeSettings(settingsPath, record, revertDeps)).toThrow(settingsPath);
    expect(readFileSync(settingsPath, "utf8")).toBe("{nope");
    expect(existsSync(revertBackup())).toBe(false);
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
