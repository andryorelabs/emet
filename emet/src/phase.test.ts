import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readPhase, writePhase, type Phase } from "./phase";

describe("phase file", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "emet-phase-"));
  });

  afterEach(() => {
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
  });

  test("the second of two writes wins and no temporary file is left", () => {
    const first: Phase = "dispatch";
    writePhase(root, { phase: first, wave: 1, spec: "S", runId: null });
    writePhase(root, { phase: "working", wave: 1, spec: "S", runId: "r1", outcome: "ok" });
    const record = readPhase(root);
    expect(record?.phase).toBe("working");
    expect(record?.runId).toBe("r1");
    expect(record?.outcome).toBe("ok");
    expect(Number.isNaN(Date.parse(record?.updatedAt ?? ""))).toBe(false);
    expect(readdirSync(path.join(root, ".emet"))).toEqual(["phase.json"]);
  });

  test("a missing file reads as null", () => {
    expect(readPhase(root)).toBeNull();
  });

  test("invalid JSON or a wrong shape reads as null without throwing", () => {
    mkdirSync(path.join(root, ".emet"));
    writeFileSync(path.join(root, ".emet", "phase.json"), "{nope");
    expect(readPhase(root)).toBeNull();
    writeFileSync(path.join(root, ".emet", "phase.json"), JSON.stringify({ phase: "bogus" }));
    expect(readPhase(root)).toBeNull();
  });

  test("a write into a read-only root does not throw", () => {
    chmodSync(root, 0o555);
    expect(() => {
      writePhase(root, { phase: "done", wave: null, spec: null, runId: null });
    }).not.toThrow();
  });
});
