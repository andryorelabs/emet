import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type JsonObject,
  mergeClaudeHooks,
  mergeCodexHooks,
  removeEmetHooks,
  standaloneExtraHooks,
} from "./hooks-merge.ts";

const BIN = "/home/u/.local/bin/emet";
const root = join(import.meta.dir, "..", "..");

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isObject(parsed)) throw new Error(`${path} is not an object`);
  return parsed;
}

const claudeDefinitions = readJsonObject(join(root, "hooks", "hooks.json"));
const codexDefinitions = readJsonObject(join(root, "codex", "hooks.json"));

const foreignHook = { type: "command", command: "echo foreign" };
const foreign = { hooks: [foreignHook] };

function hooksOf(document: JsonObject): JsonObject {
  const { hooks } = document;
  if (!isObject(hooks)) throw new Error("no hooks object");
  return hooks;
}

function groupsOf(document: JsonObject, event: string): JsonObject[] {
  const groups = hooksOf(document)[event];
  if (!Array.isArray(groups)) throw new Error(`no ${event} groups`);
  return groups.filter((group): group is JsonObject => isObject(group));
}

test("adds every Claude event with absolute commands and no plugin variables", () => {
  const { settings, added } = mergeClaudeHooks({}, claudeDefinitions, BIN);
  expect(Object.keys(hooksOf(settings)).toSorted()).toEqual(
    Object.keys(hooksOf(claudeDefinitions)).toSorted(),
  );
  expect(added).toContain(`"${BIN}" setup --notice`);
  expect(added).toContain(`"${BIN}" whats-new --hook`);
  expect(added).toContain(`"${BIN}" guard`);
  expect(added.some((command) => command.includes("CLAUDE_PLUGIN"))).toBe(false);
  expect(added.some((command) => command.includes("EMET_PREFETCH"))).toBe(false);
});

test("re-adding is idempotent", () => {
  const first = mergeClaudeHooks({}, claudeDefinitions, BIN);
  const second = mergeClaudeHooks(first.settings, claudeDefinitions, BIN);
  expect(second.added).toEqual([]);
  expect(second.settings).toEqual(first.settings);
});

test("foreign hooks keep their order and emet follows", () => {
  const other = { hooks: [{ type: "command", command: "echo other" }] };
  const settings = {
    model: "x",
    hooks: { Stop: [foreign, other], PreToolUse: [{ matcher: "Bash", ...foreign }] },
  };
  const merged = mergeClaudeHooks(settings, claudeDefinitions, BIN).settings;
  expect(merged.model).toBe("x");
  expect(groupsOf(merged, "Stop").slice(0, 2)).toEqual([foreign, other]);
  expect(groupsOf(merged, "Stop")).toHaveLength(3);
  expect(groupsOf(merged, "PreToolUse")[0]).toEqual({ matcher: "Bash", ...foreign });
  expect(groupsOf(merged, "PreToolUse")).toHaveLength(2);
});

test("widens a narrower PreToolUse matcher in place", () => {
  const narrow = {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `"${BIN}" guard` }] }],
    },
  };
  const { settings, added } = mergeClaudeHooks(narrow, claudeDefinitions, BIN);
  const groups = groupsOf(settings, "PreToolUse");
  expect(groups).toHaveLength(1);
  expect(groups[0]?.matcher).toBe("Bash|ScheduleWakeup|Skill|Edit|Write|MultiEdit|NotebookEdit");
  expect(added).not.toContain(`"${BIN}" guard`);
});

test("does not mutate its inputs", () => {
  const settings = { hooks: { Stop: [foreign] } };
  const snapshot = structuredClone(settings);
  mergeClaudeHooks(settings, claudeDefinitions, BIN);
  expect(settings).toEqual(snapshot);
});

test("appends Codex hooks after foreign ones and is idempotent", () => {
  const existing = { hooks: { Stop: [foreign], SessionStart: [foreign] } };
  const first = mergeCodexHooks(existing, codexDefinitions, BIN);
  const stop = groupsOf(first.hooksJson, "Stop");
  expect(stop[0]).toEqual(foreign);
  expect(JSON.stringify(stop[1])).toContain(
    `EMET_AGENT_HOST=codex \\"${BIN}\\" guard --event Stop`,
  );
  expect(first.added).toContain(`EMET_AGENT_HOST=codex "${BIN}" whats-new --hook`);
  const second = mergeCodexHooks(first.hooksJson, codexDefinitions, BIN);
  expect(second.added).toEqual([]);
  expect(second.hooksJson).toEqual(first.hooksJson);
});

test("removes every emet hook command and prunes empty events", () => {
  const withUpdate: JsonObject = {
    hooks: {
      ...hooksOf(claudeDefinitions),
      SessionStart: [
        {
          hooks: [
            { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/bin/emet" self update --auto' },
          ],
        },
      ],
    },
  };
  const base = mergeClaudeHooks({ hooks: { Stop: [foreign] } }, claudeDefinitions, BIN).settings;
  const merged = mergeClaudeHooks(base, withUpdate, BIN).settings;
  const { doc, removed } = removeEmetHooks(merged);
  expect(doc).toEqual({ hooks: { Stop: [foreign] } });
  expect(removed).toContain(`"${BIN}" guard`);
  expect(removed).toContain(`"${BIN}" setup --notice`);
  expect(removed).toContain(`"${BIN}" whats-new --hook`);
  expect(removed).toContain(`"${BIN}" self update --auto`);
});

test("removal handles Codex commands and a bare emet", () => {
  const merged = mergeCodexHooks({}, codexDefinitions, BIN).hooksJson;
  expect(removeEmetHooks(merged).doc).toEqual({});
  const bare = { hooks: { Stop: [{ hooks: [{ type: "command", command: "emet guard" }] }] } };
  expect(removeEmetHooks(bare)).toEqual({ doc: {}, removed: ["emet guard"] });
});

test("removal leaves foreign hooks and unrelated documents untouched", () => {
  const document = {
    keep: 1,
    hooks: {
      Stop: [{ hooks: [foreignHook, { type: "command", command: "echo emet guard" }] }],
    },
  };
  const result = removeEmetHooks(document);
  expect(result.removed).toEqual([]);
  expect(result.doc).toBe(document);
  expect(removeEmetHooks({ a: 1 }).doc).toEqual({ a: 1 });
});

test("removal keeps events that are not arrays", () => {
  const document = {
    hooks: { Odd: "x", Stop: [{ hooks: [{ type: "command", command: "emet guard" }] }] },
  };
  expect(removeEmetHooks(document).doc).toEqual({ hooks: { Odd: "x" } });
});

test("standaloneExtraHooks is empty for now", () => {
  expect(standaloneExtraHooks(BIN)).toEqual({});
});

test("mergeClaudeHooks does not duplicate a legacy unquoted install.sh guard hook", () => {
  const legacy: JsonObject = {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `${BIN} guard` }] }],
      Stop: [{ hooks: [{ type: "command", command: `${BIN} guard --event Stop` }] }],
    },
  };
  const { settings } = mergeClaudeHooks(legacy, claudeDefinitions, BIN);
  const hooks = settings.hooks;
  if (!isObject(hooks)) throw new Error("hooks missing");
  const countOf = (event: string): number =>
    JSON.stringify(hooks[event]).split(" guard").length - 1;
  expect(countOf("PreToolUse")).toBe(1);
  expect(countOf("Stop")).toBe(1);
});
