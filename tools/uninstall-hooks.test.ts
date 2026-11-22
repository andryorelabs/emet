import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isObject } from "../emet/src/narrow";
import { GUARD_COMMAND_PATTERN } from "../emet/src/uninstall";

const repoRoot = path.resolve(import.meta.dir, "..");
const installScript = readFileSync(path.join(repoRoot, "install.sh"), "utf8");
const hookConfig: unknown = JSON.parse(
  readFileSync(path.join(repoRoot, "hooks", "hooks.json"), "utf8"),
);
const PLUGIN_BINARY = '"${CLAUDE_PLUGIN_ROOT}/bin/emet" ';
const SAMPLE_HOME = "/home/someone";

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : [];
}

/** Each event in hooks.json with the `guard ...` arguments of its guard hook. */
function pluginGuardHooks(): { event: string; args: string }[] {
  if (!isObject(hookConfig) || !isObject(hookConfig.hooks))
    throw new Error("hooks.json has no hooks");
  return Object.entries(hookConfig.hooks).flatMap(([event, groups]) => {
    const commands = arrayOf(groups)
      .flatMap((group) => (isObject(group) ? arrayOf(group.hooks) : []))
      .flatMap((hook: unknown) =>
        isObject(hook) && typeof hook.command === "string" ? [hook.command] : [],
      );
    return commands
      .filter((command) => command.startsWith(`${PLUGIN_BINARY}guard`))
      .map((command) => ({ event, args: command.slice(PLUGIN_BINARY.length) }));
  });
}

/** The events install.sh loops over to wire `$GUARD_COMMAND --event <event>`. */
function loopedEvents(): string[] {
  return [
    ...installScript.matchAll(
      /for (\w+_EVENT) in ([\w ]+); do\n\s+\w+="\$GUARD_COMMAND --event \$\1"/g,
    ),
  ].flatMap((match) => (match[2] ?? "").trim().split(/\s+/));
}

/** The command install.sh writes for `event`, with HOME expanded. */
function installedCommand(event: string): string {
  const guardCommand = /^GUARD_COMMAND="([^"]+)"$/m.exec(installScript)?.[1] ?? "";
  const base = guardCommand.replace("$HOME", SAMPLE_HOME);
  return event === "PreToolUse" ? base : `${base} --event ${event}`;
}

describe("emet uninstall guard hook coverage", () => {
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

  test("every guard event in hooks.json is wired by install.sh", () => {
    const wired = new Set(loopedEvents());
    if (
      installScript.includes(
        '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher": $matcher, "hooks": [{"type": "command", "command": $cmd}]}])',
      )
    ) {
      wired.add("PreToolUse");
    }
    for (const { event } of pluginGuardHooks())
      expect({ event, wired: wired.has(event) }).toEqual({ event, wired: true });
  });

  test("install.sh wires each event with the same guard arguments as hooks.json", () => {
    for (const { event, args } of pluginGuardHooks()) {
      expect(installedCommand(event)).toBe(`${SAMPLE_HOME}/.local/bin/emet ${args}`);
    }
  });

  test("every command install.sh wires is matched by the uninstall pattern", () => {
    for (const { event } of pluginGuardHooks()) {
      expect({ event, matched: GUARD_COMMAND_PATTERN.test(installedCommand(event)) }).toEqual({
        event,
        matched: true,
      });
    }
  });
});
