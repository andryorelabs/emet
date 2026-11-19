import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isObject } from "./narrow";

/** The Claude Code settings `emet setup` recommends: a planning model and deny rules for risky commands and secrets. */
export interface RecommendedSettings {
  readonly model: string;
  readonly deny: readonly string[];
}

export const RECOMMENDED_CLAUDE_SETTINGS: RecommendedSettings = {
  model: "opusplan",
  deny: ["Bash(rm -rf:*)", "Bash(git push --force:*)", "Read(./.env)", "Read(./.env.*)"],
};

export interface SettingsApplyDeps {
  readonly now: () => Date;
}

function readSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new TypeError(`${settingsPath} is not a JSON object`);
  }
  return parsed;
}

function readDenyRules(settings: Record<string, unknown>): string[] {
  const { permissions } = settings;
  if (!isObject(permissions)) return [];
  const { deny } = permissions;
  return Array.isArray(deny) ? deny.filter((rule): rule is string => typeof rule === "string") : [];
}

/**
 * Whether the settings file already carries the recommended model and every
 * recommended deny rule. A missing or unreadable file is not applied.
 */
export function isRecommendedApplied(
  settingsPath: string,
  recommended: RecommendedSettings,
): boolean {
  try {
    const settings = readSettings(settingsPath);
    const deny = new Set(readDenyRules(settings));
    return settings.model === recommended.model && recommended.deny.every((rule) => deny.has(rule));
  } catch {
    return false;
  }
}

/**
 * Merges the recommended settings into `settingsPath`: sets `model` and adds the
 * missing deny rules, keeping every other key. An existing file is copied to a
 * timestamped `.bak-` sibling first and that path is returned; when there is no
 * file yet, one is created and `backupPath` is the empty string.
 */
export function applyClaudeSettings(
  settingsPath: string,
  recommended: RecommendedSettings,
  deps: SettingsApplyDeps,
): { backupPath: string } {
  const settings = readSettings(settingsPath);
  let backupPath = "";
  if (existsSync(settingsPath)) {
    const stamp = deps.now().toISOString().replaceAll(/[:.]/g, "-");
    backupPath = `${settingsPath}.bak-${stamp}`;
    copyFileSync(settingsPath, backupPath);
  }
  const permissions = isObject(settings.permissions) ? settings.permissions : {};
  const deny = [...new Set([...readDenyRules(settings), ...recommended.deny])];
  const merged = {
    ...settings,
    model: recommended.model,
    permissions: { ...permissions, deny },
  };
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);
  return { backupPath };
}
