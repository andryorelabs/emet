import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { detectEmetPlugin } from "./plugin-detect.ts";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "emet-plugin-detect-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const target = join(home, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

test("an empty home has no plugin", () => {
  expect(detectEmetPlugin(home)).toEqual({ claude: false, codex: false, ids: [] });
});

test("detects the Claude Code plugin from installed_plugins.json", () => {
  write(
    ".claude/plugins/installed_plugins.json",
    JSON.stringify({ plugins: { "emet@emet-marketplace": [{}], "other@market": [{}] } }),
  );
  expect(detectEmetPlugin(home)).toEqual({
    claude: true,
    codex: false,
    ids: ["emet@emet-marketplace"],
  });
});

test("detects the Claude Code plugin from enabledPlugins", () => {
  write(
    ".claude/settings.json",
    JSON.stringify({ enabledPlugins: { "emet@emet-marketplace": true } }),
  );
  expect(detectEmetPlugin(home).claude).toBe(true);
});

test("a disabled or foreign plugin does not count", () => {
  write(
    ".claude/settings.json",
    JSON.stringify({ enabledPlugins: { "emet@emet-marketplace": false, "x@y": true } }),
  );
  write(".claude/plugins/installed_plugins.json", "not json");
  expect(detectEmetPlugin(home).claude).toBe(false);
});

test("detects the Codex plugin from config.toml", () => {
  write(".codex/config.toml", '[plugins."emet@emet-marketplace"]\nenabled = true\n');
  expect(detectEmetPlugin(home)).toEqual({
    claude: false,
    codex: true,
    ids: ["emet@emet-marketplace"],
  });
});

test("an unreadable config is treated as absent", () => {
  mkdirSync(join(home, ".codex", "config.toml"), { recursive: true });
  expect(detectEmetPlugin(home).codex).toBe(false);
});

test("an unrelated Codex config is not the plugin", () => {
  write(".codex/config.toml", '[plugins."other@market"]\nenabled = true\n');
  expect(detectEmetPlugin(home).codex).toBe(false);
});
