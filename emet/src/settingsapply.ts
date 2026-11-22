import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { errorMessage, isObject } from "./narrow";
import type { UndoRecord } from "./setupledger";

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

function backupSettings(settingsPath: string, deps: SettingsApplyDeps): string {
  const stamp = deps.now().toISOString().replaceAll(/[:.]/g, "-");
  const backupPath = `${settingsPath}.bak-${stamp}`;
  copyFileSync(settingsPath, backupPath);
  return backupPath;
}

function writeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

/** What `applyClaudeSettings` changed, so `revertClaudeSettings` can undo exactly that. */
export interface AppliedClaudeSettings {
  readonly backupPath: string;
  readonly previousModel: string | null;
  readonly addedDeny: string[];
}

/**
 * Merges the recommended settings into `settingsPath`: sets `model` and adds the
 * missing deny rules, keeping every other key. An existing file is copied to a
 * timestamped `.bak-` sibling first and that path is returned; when there is no
 * file yet, one is created and `backupPath` is the empty string. It also returns
 * the `model` the file held before (`null` when it had none) and the deny rules
 * it actually added.
 */
export function applyClaudeSettings(
  settingsPath: string,
  recommended: RecommendedSettings,
  deps: SettingsApplyDeps,
): AppliedClaudeSettings {
  const settings = readSettings(settingsPath);
  const backupPath = existsSync(settingsPath) ? backupSettings(settingsPath, deps) : "";
  const previousModel = typeof settings.model === "string" ? settings.model : null;
  const existingDeny = readDenyRules(settings);
  const existing = new Set(existingDeny);
  const addedDeny = [...new Set(recommended.deny)].filter((rule) => !existing.has(rule));
  const permissions = isObject(settings.permissions) ? settings.permissions : {};
  writeSettings(settingsPath, {
    ...settings,
    model: recommended.model,
    permissions: { ...permissions, deny: [...existingDeny, ...addedDeny] },
  });
  return { backupPath, previousModel, addedDeny };
}

/** The ledger record `revertClaudeSettings` undoes. */
export type ClaudeSettingsUndo = Extract<UndoRecord, { kind: "claude-settings" }>;

/** The `permissions` value without emet's added deny rules, or `undefined` when nothing is left. */
function revertPermissions(permissions: unknown, addedDeny: readonly string[]): unknown {
  if (!isObject(permissions) || Array.isArray(permissions)) return permissions;
  const { deny } = permissions;
  if (!Array.isArray(deny)) return permissions;
  const added = new Set(addedDeny);
  const kept = deny.filter((rule) => typeof rule !== "string" || !added.has(rule));
  if (kept.length > 0) return { ...permissions, deny: kept };
  const rest = Object.fromEntries(Object.entries(permissions).filter(([key]) => key !== "deny"));
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function readSettingsForRevert(settingsPath: string): Record<string, unknown> {
  try {
    return readSettings(settingsPath);
  } catch (error) {
    throw new Error(`cannot read ${settingsPath}: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * Undoes `applyClaudeSettings` surgically: restores the previous `model` (or
 * deletes the key when there was none) and removes only the deny rules emet
 * added, keeping every later edit. When the current `model` is no longer the one
 * setup set, it is kept and a warning is returned. The file is copied to a
 * timestamped `.bak-` sibling before it changes. A missing file changes nothing
 * and returns a warning; an unreadable one throws with its path.
 */
export function revertClaudeSettings(
  settingsPath: string,
  record: ClaudeSettingsUndo,
  deps: SettingsApplyDeps,
): { warnings: string[] } {
  if (!existsSync(settingsPath)) {
    return { warnings: [`${settingsPath} does not exist; nothing to revert`] };
  }
  const settings = readSettingsForRevert(settingsPath);
  const warnings: string[] = [];
  const reverted: Record<string, unknown> = { ...settings };
  if (settings.model !== record.setModel) {
    warnings.push(
      `${settingsPath}: model is ${JSON.stringify(settings.model ?? null)}, not ${JSON.stringify(record.setModel)} as setup set it; keeping it`,
    );
  } else if (record.previousModel === null) {
    delete reverted.model;
  } else {
    reverted.model = record.previousModel;
  }
  if ("permissions" in settings) {
    const permissions = revertPermissions(settings.permissions, record.addedDeny);
    if (permissions === undefined) delete reverted.permissions;
    else reverted.permissions = permissions;
  }
  backupSettings(settingsPath, deps);
  writeSettings(settingsPath, reverted);
  return { warnings };
}
