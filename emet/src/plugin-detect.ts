import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EMET_PLUGIN_ID = "emet@emet-marketplace";

function readText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readJson(path: string): unknown {
  const text = readText(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function claudePluginIds(home: string): string[] {
  const ids: string[] = [];
  const installed = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
  if (isObject(installed) && isObject(installed.plugins) && EMET_PLUGIN_ID in installed.plugins) {
    ids.push(EMET_PLUGIN_ID);
  }
  const settings = readJson(join(home, ".claude", "settings.json"));
  if (isObject(settings) && isObject(settings.enabledPlugins)) {
    if (settings.enabledPlugins[EMET_PLUGIN_ID] === true) ids.push(EMET_PLUGIN_ID);
  }
  return ids;
}

function codexPluginIds(home: string): string[] {
  const config = readText(join(home, ".codex", "config.toml"));
  if (config === undefined) return [];
  const header = /^\s*\[plugins\.["']([^"']+)["']\]/gm;
  return [...config.matchAll(header)]
    .map((match) => match[1] ?? "")
    .filter((id) => id === EMET_PLUGIN_ID);
}

/** Reports whether the emet plugin is installed for Claude Code and for Codex, reading only under `home`. */
export function detectEmetPlugin(home: string): {
  claude: boolean;
  codex: boolean;
  ids: readonly string[];
} {
  const claudeIds = claudePluginIds(home);
  const codexIds = codexPluginIds(home);
  return {
    claude: claudeIds.length > 0,
    codex: codexIds.length > 0,
    ids: [...new Set([...claudeIds, ...codexIds])],
  };
}
