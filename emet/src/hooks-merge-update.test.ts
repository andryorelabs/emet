import { expect, test } from "bun:test";

import {
  type JsonObject,
  mergeClaudeHooks,
  removeEmetHooks,
  standaloneExtraHooks,
} from "./hooks-merge";

const BIN = "/home/u/.local/bin/emet";
const AUTO_UPDATE = `"${BIN}" self update --auto`;
const foreign = { hooks: [{ type: "command", command: "echo foreign" }] };

test("standaloneExtraHooks adds the SessionStart auto-update hook after foreign ones", () => {
  const settings: JsonObject = { hooks: { SessionStart: [foreign] } };
  const merged = mergeClaudeHooks(settings, standaloneExtraHooks(BIN), BIN);
  expect(merged.added).toEqual([AUTO_UPDATE]);
  expect(merged.settings).toEqual({
    hooks: {
      SessionStart: [foreign, { hooks: [{ type: "command", command: AUTO_UPDATE }] }],
    },
  });
});

test("the auto-update hook is added once", () => {
  const first = mergeClaudeHooks({}, standaloneExtraHooks(BIN), BIN);
  const second = mergeClaudeHooks(first.settings, standaloneExtraHooks(BIN), BIN);
  expect(second.added).toEqual([]);
  expect(second.settings).toEqual(first.settings);
});

test("removeEmetHooks removes the auto-update hook and keeps foreign ones", () => {
  const settings: JsonObject = { hooks: { SessionStart: [foreign] } };
  const merged = mergeClaudeHooks(settings, standaloneExtraHooks(BIN), BIN);
  const { doc, removed } = removeEmetHooks(merged.settings);
  expect(removed).toEqual([AUTO_UPDATE]);
  expect(doc).toEqual(settings);
});
