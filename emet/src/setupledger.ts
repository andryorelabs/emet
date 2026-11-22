import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Env } from "./env";
import { stateDir } from "./names";
import { errorMessage, isObject, isOneOf } from "./narrow";
import { revertClaudeSettings } from "./settingsapply";

/** One change `emet setup` made, with what it takes to undo it. */
export type UndoRecord =
  | {
      kind: "claude-settings";
      settingsPath: string;
      previousModel: string | null;
      addedDeny: readonly string[];
      setModel: string;
      backupPath: string;
    }
  | { kind: "mcp-entry"; name: string; previousEntry: Record<string, unknown> | null }
  | { kind: "plugin"; pluginId: string }
  | { kind: "files"; paths: readonly string[] }
  | { kind: "global-package"; manager: "brew" | "bun" | "cargo"; name: string };

/** One Setup ledger entry: the setup item `id`, when it was installed and its undo records. */
export interface LedgerEntry {
  readonly id: string;
  readonly at: string;
  readonly undo: readonly UndoRecord[];
}

/** The setup item ids `emet setup --restore` accepts. */
export type RestorableId = "claude-settings" | "firecrawl-local";

const RESTORABLE_IDS: readonly RestorableId[] = ["claude-settings", "firecrawl-local"];

/** Whether `id` is one `emet setup --restore` accepts. */
export function isRestorableId(id: string): id is RestorableId {
  return isOneOf(RESTORABLE_IDS, id);
}

/** The host effects `restoreUndo` needs: a command runner, a clock and a log line sink. */
export interface RestoreDeps {
  run(argv: readonly string[]): Promise<number>;
  now(): Date;
  log(line: string): void;
}

const LEDGER_VERSION = 1;

/** The Setup ledger file, `setup-ledger.json` under `stateDir()`. */
export function ledgerPath(env?: Env): string {
  return path.join(stateDir(env), "setup-ledger.json");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

function isUndoRecord(value: unknown): value is UndoRecord {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "claude-settings": {
      return (
        typeof value.settingsPath === "string" &&
        (value.previousModel === null || typeof value.previousModel === "string") &&
        isStringArray(value.addedDeny) &&
        typeof value.setModel === "string" &&
        typeof value.backupPath === "string"
      );
    }
    case "mcp-entry": {
      return (
        typeof value.name === "string" &&
        (value.previousEntry === null || isRecord(value.previousEntry))
      );
    }
    case "plugin": {
      return typeof value.pluginId === "string";
    }
    case "files": {
      return isStringArray(value.paths);
    }
    case "global-package": {
      return (
        (value.manager === "brew" || value.manager === "bun" || value.manager === "cargo") &&
        typeof value.name === "string"
      );
    }
    default: {
      return false;
    }
  }
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.at === "string" &&
    Array.isArray(value.undo) &&
    value.undo.every((record) => isUndoRecord(record))
  );
}

/**
 * Reads the Setup ledger. An absent file is an empty ledger; a file that is not
 * valid JSON or not a ledger throws an error naming its path, never read as empty.
 */
export function readLedger(ledgerFile: string): readonly LedgerEntry[] {
  if (!existsSync(ledgerFile)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(ledgerFile, "utf8"));
  } catch (error) {
    throw new Error(`malformed setup ledger ${ledgerFile}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== LEDGER_VERSION ||
    !Array.isArray(parsed.entries) ||
    !parsed.entries.every((entry) => isLedgerEntry(entry))
  ) {
    throw new Error(`malformed setup ledger ${ledgerFile}: unexpected shape`);
  }
  return parsed.entries;
}

function writeLedger(ledgerFile: string, entries: readonly LedgerEntry[]): void {
  mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const temporary = `${ledgerFile}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: LEDGER_VERSION, entries }, null, 2)}\n`);
  renameSync(temporary, ledgerFile);
}

/**
 * Adds `entry` to the ledger, atomically. When an entry with the same id is
 * already there it is kept unchanged, so the first install's before-state wins.
 */
export function appendLedgerEntry(ledgerFile: string, entry: LedgerEntry): void {
  const entries = readLedger(ledgerFile);
  if (entries.some((existing) => existing.id === entry.id)) return;
  writeLedger(ledgerFile, [...entries, entry]);
}

/** Drops the entry with `id` from the ledger, atomically. A missing entry changes nothing. */
export function removeLedgerEntry(ledgerFile: string, id: string): void {
  const entries = readLedger(ledgerFile);
  const kept = entries.filter((entry) => entry.id !== id);
  if (kept.length === entries.length) return;
  writeLedger(ledgerFile, kept);
}

/**
 * The user-scope `mcpServers[name]` entry of a `~/.claude.json` body, or `null`
 * when the file is absent or has no such entry. Invalid JSON throws.
 */
export function readUserMcpEntry(
  claudeJson: string | undefined,
  name: string,
): Record<string, unknown> | null {
  if (claudeJson === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(claudeJson);
  } catch (error) {
    throw new Error(`~/.claude.json is not valid JSON: ${errorMessage(error)}`, { cause: error });
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return null;
  const entry = parsed.mcpServers[name];
  return isRecord(entry) ? entry : null;
}

const REMOVE_COMMANDS: Record<"brew" | "bun" | "cargo", readonly string[]> = {
  brew: ["brew", "uninstall"],
  bun: ["bun", "remove", "-g"],
  cargo: ["cargo", "uninstall"],
};

async function runChecked(deps: RestoreDeps, argv: readonly string[]): Promise<void> {
  const code = await deps.run(argv);
  if (code !== 0) throw new Error(`${argv.join(" ")} exited ${code}`);
}

async function restoreMcpEntry(
  record: Extract<UndoRecord, { kind: "mcp-entry" }>,
  deps: RestoreDeps,
): Promise<string[]> {
  const warnings: string[] = [];
  const removeArgv = ["claude", "mcp", "remove", record.name, "-s", "user"];
  const removed = await deps.run(removeArgv);
  if (removed !== 0) warnings.push(`${removeArgv.join(" ")} exited ${removed}`);
  if (record.previousEntry !== null) {
    await runChecked(deps, [
      "claude",
      "mcp",
      "add-json",
      record.name,
      JSON.stringify(record.previousEntry),
      "-s",
      "user",
    ]);
  }
  return warnings;
}

function removeFiles(paths: readonly string[]): string[] {
  const warnings: string[] = [];
  for (const file of paths) {
    if (existsSync(file)) rmSync(file, { force: true });
    else warnings.push(`${file} is already gone`);
  }
  return warnings;
}

/**
 * Undoes one ledger record. claude-settings reverts surgically (backup first);
 * an MCP entry is removed and the previous one re-added when there was one; a
 * plugin is uninstalled; files are deleted. A global package is never removed:
 * its removal command is logged for the user to run. A failing command throws;
 * anything partial or skipped comes back as a warning.
 */
export async function restoreUndo(
  record: UndoRecord,
  deps: RestoreDeps,
): Promise<{ warnings: string[] }> {
  if (record.kind === "claude-settings") {
    return revertClaudeSettings(record.settingsPath, record, deps);
  }
  if (record.kind === "mcp-entry") return { warnings: await restoreMcpEntry(record, deps) };
  if (record.kind === "plugin") {
    await runChecked(deps, ["claude", "plugin", "uninstall", record.pluginId]);
    return { warnings: [] };
  }
  if (record.kind === "files") return { warnings: removeFiles(record.paths) };
  const removeCommand = [...REMOVE_COMMANDS[record.manager], record.name].join(" ");
  deps.log(
    `Not removing the shared ${record.manager} package ${record.name}; to remove it run: ${removeCommand}`,
  );
  return { warnings: [] };
}
