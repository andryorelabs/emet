import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  type JsonObject,
  mergeClaudeHooks,
  removeEmetHooks,
  standaloneExtraHooks,
} from "../emet/src/hooks-merge";
import { isObject } from "../emet/src/narrow";

const repoRoot = path.resolve(import.meta.dir, "..");
const hookConfig: unknown = JSON.parse(
  readFileSync(path.join(repoRoot, "hooks", "hooks.json"), "utf8"),
);
const PLUGIN_BINARY = '"${CLAUDE_PLUGIN_ROOT}/bin/emet" ';
const DATA_DIR_ARGUMENT = ' --data-dir "${CLAUDE_PLUGIN_DATA}"';
const SAMPLE_HOME = "/home/someone";
const SAMPLE_BIN = `${SAMPLE_HOME}/.local/bin/emet`;
const FOREIGN_HOOK = { type: "command", command: "my-linter --check" };

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : [];
}

/** Every `{event, command}` hook in a hooks document, in order. */
function hookCommands(document: unknown): { event: string; command: string }[] {
  if (!isObject(document) || !isObject(document.hooks)) return [];
  return Object.entries(document.hooks).flatMap(([event, groups]) =>
    arrayOf(groups)
      .flatMap((group) => (isObject(group) ? arrayOf(group.hooks) : []))
      .flatMap((hook: unknown) =>
        isObject(hook) && typeof hook.command === "string"
          ? [{ event, command: hook.command }]
          : [],
      ),
  );
}

/** Each event in hooks.json with the `guard ...` arguments of its guard hook. */
function pluginGuardHooks(): { event: string; args: string }[] {
  return hookCommands(hookConfig)
    .filter(({ command }) => command.startsWith(`${PLUGIN_BINARY}guard`))
    .map(({ event, command }) => ({ event, args: command.slice(PLUGIN_BINARY.length) }));
}

/** The settings `emet self install` writes into an empty `settings.json` under SAMPLE_HOME. */
function installedSettings(initial: JsonObject = {}): JsonObject {
  if (!isObject(hookConfig)) throw new Error("hooks.json is not an object");
  const withEmbedded = mergeClaudeHooks(initial, hookConfig, SAMPLE_BIN).settings;
  return mergeClaudeHooks(withEmbedded, standaloneExtraHooks(SAMPLE_BIN), SAMPLE_BIN).settings;
}

describe("emet uninstall hook coverage", () => {
  test("hooks.json declares the seven guard events", () => {
    expect(
      pluginGuardHooks()
        .map((hook) => hook.event)
        .toSorted(),
    ).toEqual([
      "Notification",
      "PermissionRequest",
      "PreToolUse",
      "SessionEnd",
      "Stop",
      "SubagentStop",
      "UserPromptSubmit",
    ]);
  });

  test("self install wires each guard event with the same arguments as hooks.json", () => {
    const installed = hookCommands(installedSettings());
    for (const { event, args } of pluginGuardHooks()) {
      const command = `"${SAMPLE_BIN}" ${args}`;
      expect({
        event,
        wired: installed.some((hook) => hook.event === event && hook.command === command),
      }).toEqual({
        event,
        wired: true,
      });
    }
  });

  test("self install wires the SessionStart notices and auto-update, not the plugin prefetch", () => {
    const sessionStart = hookCommands(installedSettings())
      .filter((hook) => hook.event === "SessionStart")
      .map((hook) => hook.command);
    expect(sessionStart).toEqual([
      `"${SAMPLE_BIN}" setup --notice`,
      `"${SAMPLE_BIN}" whats-new --hook`,
      `"${SAMPLE_BIN}" self update --auto`,
    ]);
    expect(JSON.stringify(installedSettings())).not.toContain(DATA_DIR_ARGUMENT.trim());
  });

  test("every hook self install wires is removed by emet uninstall", () => {
    const installed = installedSettings();
    const { doc, removed } = removeEmetHooks(installed);
    expect(removed.toSorted()).toEqual(
      hookCommands(installed)
        .map((hook) => hook.command)
        .toSorted(),
    );
    expect(doc).toEqual({});
  });

  test("emet uninstall keeps foreign hooks where they were", () => {
    const foreign: JsonObject = {
      model: "opus",
      hooks: { Stop: [{ hooks: [FOREIGN_HOOK] }] },
    };
    const { doc } = removeEmetHooks(installedSettings(foreign));
    expect(doc).toEqual(foreign);
  });
});
