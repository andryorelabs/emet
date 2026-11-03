import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  checkSkillsContract,
  parsePluginListJson,
  resolveSkillPath,
  SKILLS_CONTRACT,
  type InstalledPlugin,
} from "./skills";

function installFakePlugin(skillNames: readonly string[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "forge-skills-"));
  for (const name of skillNames) {
    const directory = path.join(root, "skills", "engineering", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "SKILL.md"), "");
  }
  return root;
}

function pluginAt(installPath: string, version: string): InstalledPlugin {
  return {
    id: "mattpocock-skills@claude-plugins-official",
    version,
    enabled: true,
    installPath,
  };
}

describe("parsePluginListJson", () => {
  test("keeps well-formed entries and drops the rest", () => {
    const output = JSON.stringify([
      { id: "a@b", version: "1.0.0", enabled: false, installPath: "/x" },
      { id: 3 },
      "nope",
    ]);
    expect(parsePluginListJson(output)).toEqual([
      { id: "a@b", version: "1.0.0", enabled: false, installPath: "/x" },
    ]);
  });

  test("garbage yields an empty list", () => {
    expect(parsePluginListJson("not json")).toEqual([]);
    expect(parsePluginListJson("{}")).toEqual([]);
  });
});

describe("resolveSkillPath", () => {
  test("returns the SKILL.md path, null when absent", () => {
    const root = installFakePlugin(["tdd"]);
    try {
      const plugins = [pluginAt(root, "1.3.1")];
      expect(resolveSkillPath("tdd", plugins)).toBe(
        path.join(root, "skills", "engineering", "tdd", "SKILL.md"),
      );
      expect(resolveSkillPath("nope", plugins)).toBeNull();
      expect(resolveSkillPath("tdd", [])).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("checkSkillsContract", () => {
  test("clean when every skill exists in range", () => {
    const root = installFakePlugin(SKILLS_CONTRACT.names);
    try {
      expect(checkSkillsContract([pluginAt(root, "1.3.1")])).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing skill is unsatisfied and named", () => {
    const root = installFakePlugin(SKILLS_CONTRACT.names.filter((name) => name !== "tdd"));
    try {
      const checks = checkSkillsContract([pluginAt(root, "1.3.1")]);
      expect(checks).toHaveLength(1);
      expect(checks[0]?.status).toBe("unsatisfied");
      expect(checks[0]?.summary).toContain("tdd");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an out-of-range version only warns", () => {
    const root = installFakePlugin(SKILLS_CONTRACT.names);
    try {
      const checks = checkSkillsContract([pluginAt(root, "2.0.0")]);
      expect(checks.map((check) => check.status)).toEqual(["indeterminate"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("no plugin installed is left to the claude-plugin check", () => {
    expect(checkSkillsContract([])).toEqual([]);
  });
});
