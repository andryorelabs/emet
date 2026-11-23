import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { embeddedTree } from "./assets";
import type { JsonObject } from "./hooks-merge";
import { installClaudeHost } from "./self-host-claude";
import type { HostContext } from "./self-types";

const BACKUP_MARKER = ".pre-emet-guard-backup.";
const NOW = new Date("2026-11-23T21:30:05.123Z");
const BACKUP_SUFFIX = "20261123T213005Z";

let home = "";
let logged: string[] = [];

function settingsPath(): string {
  return path.join(home, ".claude", "settings.json");
}

function context(overrides: Partial<HostContext> = {}): HostContext {
  return {
    home,
    emetBin: path.join(home, ".local/bin/emet"),
    tree: embeddedTree(),
    dryRun: false,
    force: false,
    now: () => NOW,
    log: (line) => logged.push(line),
    ...overrides,
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(text: string): JsonObject {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed)) throw new Error("expected a JSON object");
  return parsed;
}

function hooksOf(document: JsonObject): JsonObject {
  const { hooks } = document;
  if (!isObject(hooks)) throw new Error("no hooks object");
  return hooks;
}

function readSettings(): JsonObject {
  return parseObject(readFileSync(settingsPath(), "utf8"));
}

function commandsOf(document: JsonObject, event: string): string[] {
  const groups = hooksOf(document)[event];
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group: unknown) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return [];
    return group.hooks.flatMap((hook: unknown) =>
      isObject(hook) && typeof hook.command === "string" ? [hook.command] : [],
    );
  });
}

function writeSettings(content: string): void {
  mkdirSync(path.dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), content);
}

function backups(): string[] {
  const directory = path.dirname(settingsPath());
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.startsWith(`settings.json${BACKUP_MARKER}`))
    .toSorted();
}

const embeddedDefinitions = parseObject(embeddedTree().read("hooks/hooks.json"));
const foreignStop = { hooks: [{ type: "command", command: "notify-send stop" }] };
const foreignPreToolUse = {
  matcher: "Bash",
  hooks: [{ type: "command", command: "my-linter --check" }],
};

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "emet self-host hooks ñ "));
  logged = [];
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("installClaudeHost settings.json hooks", () => {
  test("wires every embedded event with absolute symlink commands into a missing settings.json", () => {
    const result = installClaudeHost(context());
    const settings = readSettings();
    const bin = `"${path.join(home, ".local/bin/emet")}"`;
    expect(Object.keys(hooksOf(settings)).toSorted()).toEqual(
      Object.keys(hooksOf(embeddedDefinitions)).toSorted(),
    );
    for (const event of Object.keys(hooksOf(settings))) {
      for (const command of commandsOf(settings, event)) {
        expect(command.startsWith(`${bin} `)).toBe(true);
        expect(command).not.toContain("CLAUDE_PLUGIN");
      }
    }
    expect(commandsOf(settings, "SessionStart")).toEqual([
      `${bin} setup --notice`,
      `${bin} whats-new --hook`,
      `${bin} self update --auto`,
    ]);
    expect(result.writes).toContain(settingsPath());
    expect(backups()).toEqual([]);
  });

  test("keeps foreign hooks and unknown keys in order and appends emet's after them", () => {
    writeSettings(
      `${JSON.stringify({
        model: "opus",
        hooks: { Stop: [foreignStop], PreToolUse: [foreignPreToolUse], FutureEvent: [foreignStop] },
      })}\n`,
    );
    installClaudeHost(context());
    const settings = readSettings();
    expect(settings.model).toBe("opus");
    const hooks = hooksOf(settings);
    expect(Object.keys(hooks).slice(0, 3)).toEqual(["Stop", "PreToolUse", "FutureEvent"]);
    expect(hooks.FutureEvent).toEqual([foreignStop]);
    const stop = hooks.Stop;
    const preToolUse = hooks.PreToolUse;
    if (!Array.isArray(stop) || !Array.isArray(preToolUse)) throw new Error("missing events");
    expect(stop[0]).toEqual(foreignStop);
    expect(stop).toHaveLength(2);
    expect(preToolUse[0]).toEqual(foreignPreToolUse);
    expect(preToolUse).toHaveLength(2);
  });

  test("backs the previous file up byte for byte before writing", () => {
    const original =
      '{\n    "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "x"}]}]}\n}';
    writeSettings(original);
    const result = installClaudeHost(context());
    const backupPath = `${settingsPath()}${BACKUP_MARKER}${BACKUP_SUFFIX}`;
    expect(backups()).toEqual([path.basename(backupPath)]);
    expect(readFileSync(backupPath, "utf8")).toBe(original);
    expect(result.writes).toContain(backupPath);
    expect(result.writes).toContain(settingsPath());
  });

  test("keeps at most five backups, dropping the oldest", () => {
    writeSettings("{}\n");
    const directory = path.dirname(settingsPath());
    const older = [
      "20200101T000000Z",
      "20210101T000000Z",
      "20220101T000000Z",
      "20230101T000000Z",
      "20240101T000000Z.legacy",
      "20250101T000000Z",
    ];
    for (const suffix of older) {
      writeFileSync(path.join(directory, `settings.json${BACKUP_MARKER}${suffix}`), "{}\n");
    }
    const result = installClaudeHost(context());
    expect(backups()).toEqual(
      [
        "20220101T000000Z",
        "20230101T000000Z",
        "20240101T000000Z.legacy",
        "20250101T000000Z",
        BACKUP_SUFFIX,
      ].map((suffix) => `settings.json${BACKUP_MARKER}${suffix}`),
    );
    expect(result.writes).toContain(
      path.join(directory, `settings.json${BACKUP_MARKER}20200101T000000Z`),
    );
  });

  test("a second run is a no-op: no duplicate hook, no new backup, no write", () => {
    writeSettings(`${JSON.stringify({ hooks: { Stop: [foreignStop] } })}\n`);
    installClaudeHost(context({ now: () => new Date("2026-11-23T00:00:00Z") }));
    const afterFirst = readFileSync(settingsPath(), "utf8");
    const backupsAfterFirst = backups();
    const second = installClaudeHost(context());
    expect(second.status).toBe("unchanged");
    expect(second.writes).toEqual([]);
    expect(readFileSync(settingsPath(), "utf8")).toBe(afterFirst);
    expect(backups()).toEqual(backupsAfterFirst);
  });

  test("invalid JSON leaves the file byte-identical, writes nothing and names the file", () => {
    const broken = '{ "hooks": { "Stop": [ }';
    writeSettings(broken);
    expect(() => installClaudeHost(context())).toThrow(settingsPath());
    expect(readFileSync(settingsPath(), "utf8")).toBe(broken);
    expect(readdirSync(home)).toEqual([".claude"]);
    expect(readdirSync(path.join(home, ".claude"))).toEqual(["settings.json"]);
  });

  test("a non-object document is refused naming the file", () => {
    writeSettings("[]\n");
    expect(() => installClaudeHost(context())).toThrow(settingsPath());
    expect(readFileSync(settingsPath(), "utf8")).toBe("[]\n");
  });

  test("an empty settings.json is treated as an empty object and backed up", () => {
    writeSettings("");
    installClaudeHost(context());
    expect(Object.keys(hooksOf(readSettings())).length).toBeGreaterThan(0);
    expect(backups()).toEqual([`settings.json${BACKUP_MARKER}${BACKUP_SUFFIX}`]);
  });

  test("--dry-run logs the planned additions and writes nothing", () => {
    const original = `${JSON.stringify({ hooks: { Stop: [foreignStop] } })}\n`;
    writeSettings(original);
    const result = installClaudeHost(context({ dryRun: true }));
    expect(readFileSync(settingsPath(), "utf8")).toBe(original);
    expect(backups()).toEqual([]);
    expect(existsSync(path.join(home, ".claude", "emet"))).toBe(false);
    expect(result.writes).toContain(settingsPath());
    const bin = `"${path.join(home, ".local/bin/emet")}"`;
    expect(logged).toContain(`would add hook: ${bin} guard`);
    expect(logged).toContain(`would add hook: ${bin} guard --event Stop`);
    expect(logged).toContain(`would add hook: ${bin} setup --notice`);
  });

  test("writes through a symlinked settings.json and keeps its mode", () => {
    const realDirectory = path.join(home, "dotfiles");
    mkdirSync(realDirectory, { recursive: true });
    const realPath = path.join(realDirectory, "settings.json");
    writeFileSync(realPath, "{}\n");
    chmodSync(realPath, 0o600);
    mkdirSync(path.dirname(settingsPath()), { recursive: true });
    symlinkSync(realPath, settingsPath());
    installClaudeHost(context());
    expect(lstatSync(settingsPath()).isSymbolicLink()).toBe(true);
    expect(Object.keys(hooksOf(readSettings())).length).toBeGreaterThan(0);
    expect(statSync(realPath).mode & 0o777).toBe(0o600);
  });

  test("a tree without hooks/hooks.json writes only the standalone auto-update hook", () => {
    const tree = { list: () => [], read: (file: string): string => file };
    const result = installClaudeHost(context({ tree }));
    const bin = `"${path.join(home, ".local/bin/emet")}"`;
    expect(hooksOf(readSettings())).toEqual({
      SessionStart: [{ hooks: [{ type: "command", command: `${bin} self update --auto` }] }],
    });
    expect(result.writes).toEqual([
      path.join(home, ".claude/emet/.install-manifest.json"),
      settingsPath(),
    ]);
  });
});
