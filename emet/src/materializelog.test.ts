import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { lookupTicket, recordTicket } from "./materializelog";

let directory: string;
let logPath: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "forge-mlog-"));
  logPath = path.join(directory, "run", "materialize.json");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("materialize log", () => {
  test("an unreadable or non-map log throws instead of looking empty", () => {
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, '{"a": ');
    expect(() => lookupTicket(logPath, "a")).toThrow("unreadable");
    writeFileSync(logPath, "null");
    expect(() => lookupTicket(logPath, "a")).toThrow("not a key/ticket map");
  });

  test("lookup of an unrecorded key is null", () => {
    expect(lookupTicket(logPath, "a")).toBeNull();
  });

  test("record persists immediately and lookup finds it", () => {
    recordTicket(logPath, "a", "#10");
    expect(lookupTicket(logPath, "a")).toBe("#10");
  });

  test("recording keeps earlier entries", () => {
    recordTicket(logPath, "a", "#10");
    recordTicket(logPath, "b", "#11");
    expect(lookupTicket(logPath, "a")).toBe("#10");
    expect(lookupTicket(logPath, "b")).toBe("#11");
  });

  test("re-recording a key with a different id throws instead of duplicating", () => {
    recordTicket(logPath, "a", "#10");
    expect(() => recordTicket(logPath, "a", "#12")).toThrow(/already recorded/);
  });

  test("re-recording the same pair is idempotent", () => {
    recordTicket(logPath, "a", "#10");
    recordTicket(logPath, "a", "#10");
    expect(lookupTicket(logPath, "a")).toBe("#10");
  });
});
