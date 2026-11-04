import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyDelta, mergeSpecDeltas, parseRequirements } from "./specmerge";

const BASE = `# Auth

Intro text.

### Requirement: Login
Users can log in.

#### Scenario: valid password
Given a user, when they log in, then they get a session.

#### Scenario: bad password
Then they get an error.

### Requirement: Logout
Users can log out.

#### Scenario: logout
Then the session ends.
`;

function expectOk(result: ReturnType<typeof applyDelta>): string {
  if (!result.ok) throw new Error(`unexpected conflicts: ${result.conflicts.join("; ")}`);
  return result.text;
}

describe("parseRequirements", () => {
  test("extracts names, scenarios and the preamble", () => {
    const parsed = parseRequirements(BASE);
    expect(parsed.preamble).toContain("Intro text.");
    expect(parsed.requirements.map((r) => r.name)).toEqual(["Login", "Logout"]);
    expect(parsed.requirements[0]!.scenarios).toEqual(["valid password", "bad password"]);
  });
});

describe("applyDelta", () => {
  test("ADDED appends a new requirement", () => {
    const delta = `## ADDED Requirements\n\n### Requirement: Reset\nReset it.\n\n#### Scenario: reset\nok\n`;
    const text = expectOk(applyDelta(BASE, delta));
    expect(parseRequirements(text).requirements.map((r) => r.name)).toEqual([
      "Login",
      "Logout",
      "Reset",
    ]);
  });

  test("MODIFIED replaces in place and keeps order", () => {
    const delta = `## MODIFIED Requirements\n\n### Requirement: Login\nNew body.\n\n#### Scenario: valid password\nx\n\n#### Scenario: bad password\ny\n`;
    const text = expectOk(applyDelta(BASE, delta));
    expect(text).toContain("New body.");
    expect(text).not.toContain("Users can log in.");
    expect(parseRequirements(text).requirements.map((r) => r.name)).toEqual(["Login", "Logout"]);
  });

  test("REMOVED deletes the requirement", () => {
    const delta = `## REMOVED Requirements\n\n### Requirement: Logout\n`;
    const text = expectOk(applyDelta(BASE, delta));
    expect(parseRequirements(text).requirements.map((r) => r.name)).toEqual(["Login"]);
  });

  test("ADDED of an existing name conflicts", () => {
    const delta = `## ADDED Requirements\n\n### Requirement: Login\nagain\n`;
    const result = applyDelta(BASE, delta);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts.join()).toContain("Login");
  });

  test("MODIFIED and REMOVED of a missing name conflict", () => {
    const modified = applyDelta(BASE, `## MODIFIED Requirements\n\n### Requirement: Nope\nx\n`);
    const removed = applyDelta(BASE, `## REMOVED Requirements\n\n### Requirement: Nope\n`);
    expect(modified.ok).toBe(false);
    expect(removed.ok).toBe(false);
  });

  test("the same name in two sections conflicts", () => {
    const delta = `## MODIFIED Requirements\n\n### Requirement: Login\nx\n\n#### Scenario: valid password\n.\n\n#### Scenario: bad password\n.\n\n## REMOVED Requirements\n\n### Requirement: Login\n`;
    expect(applyDelta(BASE, delta).ok).toBe(false);
  });

  test("MODIFIED that drops a scenario is reported as scenario loss", () => {
    const delta = `## MODIFIED Requirements\n\n### Requirement: Login\nNew.\n\n#### Scenario: valid password\nx\n`;
    const result = applyDelta(BASE, delta);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts.join()).toContain("bad password");
  });

  test("creates the spec when the base is empty", () => {
    const delta = `## ADDED Requirements\n\n### Requirement: First\nbody\n\n#### Scenario: s\nok\n`;
    const text = expectOk(applyDelta("", delta));
    expect(parseRequirements(text).requirements.map((r) => r.name)).toEqual(["First"]);
  });

  test("a delta with no sections is a conflict", () => {
    expect(applyDelta(BASE, "nothing here").ok).toBe(false);
  });
});

describe("mergeSpecDeltas", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "forge-specmerge-"));
    mkdirSync(path.join(directory, "specs"));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  test("writes nothing when any area conflicts", () => {
    const authPath = path.join(directory, "specs", "auth.md");
    writeFileSync(authPath, BASE);
    const result = mergeSpecDeltas(path.join(directory, "specs"), [
      { area: "billing", delta: `## ADDED Requirements\n\n### Requirement: Pay\nx\n` },
      { area: "auth", delta: `## ADDED Requirements\n\n### Requirement: Login\nx\n` },
    ]);
    expect(result.ok).toBe(false);
    expect(existsSync(path.join(directory, "specs", "billing.md"))).toBe(false);
    expect(readFileSync(authPath, "utf8")).toBe(BASE);
  });

  test("writes every area when all are clean", () => {
    writeFileSync(path.join(directory, "specs", "auth.md"), BASE);
    const result = mergeSpecDeltas(path.join(directory, "specs"), [
      { area: "billing", delta: `## ADDED Requirements\n\n### Requirement: Pay\nx\n` },
      { area: "auth", delta: `## REMOVED Requirements\n\n### Requirement: Logout\n` },
    ]);
    expect(result.ok).toBe(true);
    expect(existsSync(path.join(directory, "specs", "billing.md"))).toBe(true);
    expect(readFileSync(path.join(directory, "specs", "auth.md"), "utf8")).not.toContain("Logout");
  });

  test("rejects area names that escape the specs directory", () => {
    const result = mergeSpecDeltas(path.join(directory, "specs"), [
      { area: "../evil", delta: `## ADDED Requirements\n\n### Requirement: X\nx\n` },
    ]);
    expect(result.ok).toBe(false);
    expect(existsSync(path.join(directory, "evil.md"))).toBe(false);
  });
});
