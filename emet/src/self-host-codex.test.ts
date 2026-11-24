import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { embeddedTree } from "./assets";
import { isObject } from "./narrow";
import { installCodexHost } from "./self-host-codex";
import type { HostContext } from "./self-types";

const scratch: string[] = [];
let savedCodexHome: string | undefined;

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = savedCodexHome;
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "self-host-codex-"));
  scratch.push(dir);
  return dir;
}

function contextFor(home: string, overrides: Partial<HostContext> = {}): HostContext {
  return {
    home,
    emetBin: `${home}/.local/bin/emet`,
    tree: embeddedTree(),
    dryRun: false,
    force: false,
    now: () => new Date(0),
    log: () => undefined,
    ...overrides,
  };
}

function useDefaultCodexHome(): void {
  savedCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;
}

function readOrNull(target: string): string | null {
  try {
    return readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

const FOREIGN_HOOK = { type: "command", command: "echo foreign" };

function foreignHooksFile(): string {
  const events = ["SessionStart", "PreToolUse", "UserPromptSubmit"];
  const hooks = Object.fromEntries(events.map((event) => [event, [{ hooks: [FOREIGN_HOOK] }]]));
  return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

describe("installCodexHost", () => {
  test("skips with one line and writes nothing when Codex is absent", () => {
    useDefaultCodexHome();
    const home = tempDir();
    const lines: string[] = [];
    const result = installCodexHost(contextFor(home, { log: (line) => lines.push(line) }));
    expect(result.status).toBe("skipped");
    expect(result.writes).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(readOrNull(path.join(home, ".agents"))).toBeNull();
  });

  test("writes the namespaced skills and the plugin manifest under ~/.agents/skills/emet", () => {
    useDefaultCodexHome();
    const home = tempDir();
    mkdirSync(path.join(home, ".codex"));
    installCodexHost(contextFor(home));
    const root = path.join(home, ".agents", "skills", "emet");
    const tree = embeddedTree();
    expect(readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8")).toBe(
      tree.read(".codex-plugin/plugin.json"),
    );
    const skillFiles = tree.list().filter((file) => file.startsWith("codex/skills/"));
    expect(skillFiles.length).toBeGreaterThan(0);
    for (const treePath of skillFiles) {
      expect(readFileSync(path.join(root, treePath), "utf8")).toBe(tree.read(treePath));
    }
  });

  test("appends emet hooks after foreign ones, with absolute commands, and is idempotent", () => {
    useDefaultCodexHome();
    const home = tempDir();
    mkdirSync(path.join(home, ".codex"));
    const hooksPath = path.join(home, ".codex", "hooks.json");
    writeFileSync(hooksPath, foreignHooksFile());
    const lines: string[] = [];
    const first = installCodexHost(contextFor(home, { log: (line) => lines.push(line) }));
    expect(first.status).toBe("installed");
    expect(lines.join("\n")).toContain("/hooks");
    const written = readOrNull(hooksPath) ?? "";
    const foreignEvents = ["SessionStart", "PreToolUse", "UserPromptSubmit"];
    const parsed: unknown = JSON.parse(written);
    const events = isObject(parsed) && isObject(parsed.hooks) ? parsed.hooks : {};
    for (const event of foreignEvents) {
      const groups = events[event];
      expect(Array.isArray(groups)).toBe(true);
      expect(JSON.stringify(Array.isArray(groups) ? groups[0] : null)).toBe(
        JSON.stringify({ hooks: [FOREIGN_HOOK] }),
      );
      expect(Array.isArray(groups) ? groups.length : 0).toBeGreaterThan(1);
    }
    expect(written).toContain(`${home}/.local/bin/emet\\" guard`);
    const afterFirst = readFileSync(hooksPath, "utf8");
    const second = installCodexHost(contextFor(home));
    expect(second.status).toBe("unchanged");
    expect(second.writes).toEqual([]);
    expect(readFileSync(hooksPath, "utf8")).toBe(afterFirst);
  });

  test("backs up an existing hooks.json byte for byte before merging into it", () => {
    useDefaultCodexHome();
    const home = tempDir();
    const codexHome = path.join(home, ".codex");
    mkdirSync(codexHome);
    const hooksPath = path.join(codexHome, "hooks.json");
    const original = foreignHooksFile();
    writeFileSync(hooksPath, original);
    const result = installCodexHost(
      contextFor(home, { now: () => new Date("2026-11-23T21:30:05.123Z") }),
    );
    const backupPath = `${hooksPath}.pre-emet-guard-backup.20261123T213005Z`;
    expect(readOrNull(backupPath)).toBe(original);
    expect(result.writes).toContain(backupPath);
    expect(readFileSync(hooksPath, "utf8")).not.toBe(original);
  });

  test("creates hooks.json without a backup when none existed", () => {
    useDefaultCodexHome();
    const home = tempDir();
    const codexHome = path.join(home, ".codex");
    mkdirSync(codexHome);
    installCodexHost(contextFor(home));
    expect(readdirSync(codexHome)).toEqual(["hooks.json"]);
  });

  test("writes no backup under dryRun", () => {
    useDefaultCodexHome();
    const home = tempDir();
    const codexHome = path.join(home, ".codex");
    mkdirSync(codexHome);
    writeFileSync(path.join(codexHome, "hooks.json"), foreignHooksFile());
    installCodexHost(contextFor(home, { dryRun: true }));
    expect(readdirSync(codexHome)).toEqual(["hooks.json"]);
  });

  test("uses CODEX_HOME when set and leaves config.toml byte-identical", () => {
    savedCodexHome = process.env.CODEX_HOME;
    const home = tempDir();
    const custom = tempDir();
    process.env.CODEX_HOME = custom;
    const configText = 'model = "x"\n[projects."/a"]\ntrust_level = "trusted"\n';
    writeFileSync(path.join(custom, "config.toml"), configText);
    installCodexHost(contextFor(home));
    expect(readFileSync(path.join(custom, "hooks.json"), "utf8")).toContain("emet");
    expect(readFileSync(path.join(custom, "config.toml"), "utf8")).toBe(configText);
    expect(readOrNull(path.join(home, ".codex"))).toBeNull();
  });

  test("writes nothing under dryRun but lists the writes", () => {
    useDefaultCodexHome();
    const home = tempDir();
    mkdirSync(path.join(home, ".codex"));
    const result = installCodexHost(contextFor(home, { dryRun: true }));
    expect(result.writes.length).toBeGreaterThan(0);
    expect(readOrNull(path.join(home, ".codex", "hooks.json"))).toBeNull();
    expect(readOrNull(path.join(home, ".agents"))).toBeNull();
  });

  test("throws naming hooks.json when it is invalid JSON and writes nothing", () => {
    useDefaultCodexHome();
    const home = tempDir();
    mkdirSync(path.join(home, ".codex"));
    const hooksPath = path.join(home, ".codex", "hooks.json");
    writeFileSync(hooksPath, "{ nope");
    expect(() => installCodexHost(contextFor(home))).toThrow(hooksPath);
    expect(readOrNull(path.join(home, ".agents"))).toBeNull();
  });
});
