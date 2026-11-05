import { describe, expect, test } from "bun:test";
import { parsePhaseFile, type PhaseRecord } from "./phase-file.ts";

const valid: PhaseRecord = {
  phase: "review",
  wave: 2,
  spec: 219,
  runId: "run1",
  updatedAt: "2026-11-05T06:00:00.000Z",
};

describe("parsePhaseFile", () => {
  test("parses a valid record", () => {
    expect(parsePhaseFile(JSON.stringify(valid))).toEqual(valid);
  });

  test("keeps outcome when present", () => {
    const text = JSON.stringify({ ...valid, outcome: "ok" });
    expect(parsePhaseFile(text)?.outcome).toBe("ok");
  });

  test("returns null for invalid JSON", () => {
    expect(parsePhaseFile("{nope")).toBeNull();
  });

  test("returns null for non-objects", () => {
    expect(parsePhaseFile("[]")).toBeNull();
    expect(parsePhaseFile("null")).toBeNull();
  });

  test("returns null for an unknown phase or bad field", () => {
    expect(parsePhaseFile(JSON.stringify({ ...valid, phase: "x" }))).toBeNull();
    expect(parsePhaseFile(JSON.stringify({ ...valid, runId: 1 }))).toBeNull();
    expect(parsePhaseFile(JSON.stringify({ ...valid, outcome: 1 }))).toBeNull();
  });
});
