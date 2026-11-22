import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";
import { EmetError } from "./errors";
import { resolveLandingUnit } from "./landing-unit";
import { runDirectory } from "./runs";

const specConfig: ForgeConfig = {
  ...DEFAULT_FORGE_CONFIG,
  landing: { ...DEFAULT_FORGE_CONFIG.landing, unit: "spec" },
};
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "emet-landing-unit-"));
  directories.push(root);
  return root;
}

function writeApprovalFile(root: string, runId: string, contents: string): void {
  const directory = runDirectory(root, runId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "approval.json"), contents);
}

describe("resolveLandingUnit", () => {
  test("a null run id keeps the configured unit", () => {
    expect(resolveLandingUnit(specConfig, null, makeRoot())).toBe("spec");
  });

  test("a run without an approval record keeps the configured unit", () => {
    expect(resolveLandingUnit(specConfig, "spec900", makeRoot())).toBe("spec");
  });

  test("a quick approval resolves to wave", () => {
    const root = makeRoot();
    writeApprovalFile(root, "spec900", JSON.stringify({ mode: "quick" }));
    expect(resolveLandingUnit(specConfig, "spec900", root)).toBe("wave");
  });

  test("an approval without a mode keeps the configured unit", () => {
    const root = makeRoot();
    writeApprovalFile(root, "spec900", JSON.stringify({ specHash: "x" }));
    expect(resolveLandingUnit(specConfig, "spec900", root)).toBe("spec");
  });

  test("unreadable JSON throws an EmetError", () => {
    const root = makeRoot();
    writeApprovalFile(root, "spec900", "{nope");
    expect(() => resolveLandingUnit(specConfig, "spec900", root)).toThrow(EmetError);
  });

  test("a non-object record throws an EmetError", () => {
    const root = makeRoot();
    writeApprovalFile(root, "spec900", "[]");
    expect(() => resolveLandingUnit(specConfig, "spec900", root)).toThrow(EmetError);
  });

  test("an unknown mode throws instead of falling back", () => {
    const root = makeRoot();
    writeApprovalFile(root, "spec900", JSON.stringify({ mode: "fast" }));
    expect(() => resolveLandingUnit(specConfig, "spec900", root)).toThrow(EmetError);
  });
});
