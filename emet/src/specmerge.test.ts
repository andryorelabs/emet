import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { present } from "./present";
import {
  applyDelta,
  mergeSpecDeltas,
  parseRequirements,
  resolveSpecDeltasDir,
  run,
} from "./specmerge";

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
    expect(present(parsed.requirements[0]).scenarios).toEqual(["valid password", "bad password"]);
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
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

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

describe("parseRequirements boundaries", () => {
  test("a heading after a requirement closes it and joins the preamble", () => {
    const parsed = parseRequirements(
      "### Requirement: A\nbody a\n\n## Notes\nafter\n\n### Requirement: B\nbody b\n",
    );
    expect(parsed.requirements.map((r) => r.name)).toEqual(["A", "B"]);
    expect(present(parsed.requirements[0]).raw).toBe("### Requirement: A\nbody a");
    expect(parsed.preamble).toContain("## Notes");
  });
});

describe("applyDelta conflicts", () => {
  test("a duplicate name inside one section conflicts", () => {
    const delta = `## ADDED Requirements\n\n### Requirement: Dup\nx\n\n### Requirement: Dup\ny\n`;
    const result = applyDelta("", delta);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts.join()).toContain("appears in both");
  });

  test("a delta ignores unrelated second-level sections", () => {
    const delta = `## Notes\nignored\n\n## REMOVED Requirements\n\n### Requirement: Logout\n`;
    const text = expectOk(applyDelta(BASE, delta));
    expect(parseRequirements(text).requirements.map((r) => r.name)).toEqual(["Login"]);
  });
});

describe("mergeSpecDeltas edge cases", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-edge-"));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test("an area given twice conflicts and writes nothing", () => {
    const delta = `## ADDED Requirements\n\n### Requirement: X\nx\n`;
    const result = mergeSpecDeltas(path.join(directory, "specs"), [
      { area: "a", delta },
      { area: "a", delta },
    ]);
    expect(result).toEqual({ ok: false, conflicts: ["a: given more than once"] });
    expect(existsSync(path.join(directory, "specs"))).toBe(false);
  });

  test("a conflict is prefixed with its area", () => {
    const result = mergeSpecDeltas(path.join(directory, "specs"), [
      { area: "auth", delta: "no sections" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts[0]).toStartWith("auth: ");
  });

  test("creates the specs directory when it is missing", () => {
    const specs = path.join(directory, "nested", "specs");
    const result = mergeSpecDeltas(specs, [
      { area: "a", delta: `## ADDED Requirements\n\n### Requirement: X\nx\n` },
    ]);
    expect(result).toEqual({ ok: true, written: [path.join(specs, "a.md")] });
  });

  test("a staging failure removes already staged files and rethrows", () => {
    const specs = path.join(directory, "specs");
    mkdirSync(specs);
    mkdirSync(path.join(specs, `b.md.${String(process.pid)}.tmp`));
    const delta = `## ADDED Requirements\n\n### Requirement: X\nx\n`;
    expect(() =>
      mergeSpecDeltas(specs, [
        { area: "a", delta },
        { area: "b", delta },
      ]),
    ).toThrow();
    expect(existsSync(path.join(specs, `a.md.${String(process.pid)}.tmp`))).toBe(false);
    expect(existsSync(path.join(specs, "a.md"))).toBe(false);
  });
});

describe("run", () => {
  let root: string;
  let logs: string[];
  let errors: string[];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-run-"));
    logs = [];
    errors = [];
    console.log = (...parts: unknown[]) => {
      logs.push(parts.join(" "));
    };
    console.error = (...parts: unknown[]) => {
      errors.push(parts.join(" "));
    };
    process.exitCode = 0;
    writeFileSync(
      path.join(root, "emet.config.json"),
      JSON.stringify({ specs: { dir: "docs/specs", enabled: true } }),
    );
  });
  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    rmSync(root, { recursive: true, force: true });
  });

  function writeDelta(specId: string, file: string, text: string): void {
    const deltaDirectory = path.join(root, ".emet", "runs", specId, "spec-deltas");
    mkdirSync(deltaDirectory, { recursive: true });
    writeFileSync(path.join(deltaDirectory, file), text);
  }

  test.each([
    [[]],
    [["--spec", ""]],
    [["--spec", "../x"]],
    [["--spec", "a/b"]],
    [["--spec", ".."]],
  ])("%j prints the usage and exits 2", async (argv: string[]) => {
    await run(argv);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("usage: emet spec-merge");
  });

  test("exits 2 when the run has no deltas directory", async () => {
    await run(["--spec", "s1", "--root", root]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("no deltas at");
  });

  test("merges every delta and prints the written paths", async () => {
    writeDelta("s1", "auth.md", `## ADDED Requirements\n\n### Requirement: Login\nx\n`);
    writeDelta("s1", "billing.md", `## ADDED Requirements\n\n### Requirement: Pay\ny\n`);
    writeDelta("s1", "notes.txt", "ignored");
    await run(["--spec", "s1", "--root", root]);
    expect(process.exitCode).toBe(0);
    expect(logs).toEqual([
      path.join("docs", "specs", "auth.md"),
      path.join("docs", "specs", "billing.md"),
    ]);
    expect(readFileSync(path.join(root, "docs", "specs", "auth.md"), "utf8")).toContain("Login");
  });

  test("exits 1 and prints each conflict when a delta does not apply", async () => {
    writeDelta("s1", "auth.md", `## REMOVED Requirements\n\n### Requirement: Nope\n`);
    await run(["--spec", "s1", "--root", root]);
    expect(process.exitCode).toBe(1);
    expect(errors).toEqual(['conflict: auth: REMOVED "Nope" does not exist']);
    expect(existsSync(path.join(root, "docs", "specs"))).toBe(false);
  });

  test("exits 2 when a delta cannot be read", async () => {
    const deltaDirectory = path.join(root, ".emet", "runs", "s1", "spec-deltas");
    mkdirSync(path.join(deltaDirectory, "broken.md"), { recursive: true });
    await run(["--spec", "s1", "--root", root]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("emet spec-merge:");
  });

  test("resolves the repository root when --root is absent", async () => {
    await run(["--spec", "definitely-not-a-run-xyz"]);
    expect(process.exitCode).toBe(0);
    expect(logs).toEqual(["specs.enabled is false; nothing merged"]);
  });

  test("is a no-op that exits 0 when specs.enabled is false", async () => {
    writeFileSync(
      path.join(root, "emet.config.json"),
      JSON.stringify({ specs: { dir: "docs/specs", enabled: false } }),
    );
    writeDelta("s1", "auth.md", `## ADDED Requirements\n\n### Requirement: Login\nx\n`);
    await run(["--spec", "s1", "--root", root]);
    expect(process.exitCode).toBe(0);
    expect(logs).toEqual(["specs.enabled is false; nothing merged"]);
    expect(existsSync(path.join(root, "docs", "specs"))).toBe(false);
  });

  test("merges deltas found only in the shared run dir", async () => {
    const common = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-common-"));
    try {
      const sharedDirectory = path.join(common, ".emet", "runs", "s1", "spec-deltas");
      mkdirSync(sharedDirectory, { recursive: true });
      writeFileSync(
        path.join(sharedDirectory, "auth.md"),
        `## ADDED Requirements\n\n### Requirement: Login\nx\n`,
      );
      await run(["--spec", "s1", "--root", root], { commonDirectory: common });
      expect(process.exitCode).toBe(0);
      expect(readFileSync(path.join(root, "docs", "specs", "auth.md"), "utf8")).toContain("Login");
    } finally {
      rmSync(common, { recursive: true, force: true });
    }
  });

  test("--deltas-dir creates and prints the shared directory without merging", async () => {
    const common = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-common-"));
    try {
      await run(["--spec", "794", "--root", root, "--deltas-dir"], { commonDirectory: common });
      const expected = path.join(common, ".emet", "runs", "794", "spec-deltas");
      expect(process.exitCode).toBe(0);
      expect(logs).toEqual([expected]);
      expect(existsSync(expected)).toBe(true);
    } finally {
      rmSync(common, { recursive: true, force: true });
    }
  });

  test("--deltas-dir with an unsafe spec id exits 2 and creates nothing", async () => {
    const common = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-common-"));
    try {
      await run(["--spec", "a/b", "--root", root, "--deltas-dir"], { commonDirectory: common });
      expect(process.exitCode).toBe(2);
      expect(existsSync(path.join(common, ".emet"))).toBe(false);
    } finally {
      rmSync(common, { recursive: true, force: true });
    }
  });
});

describe("resolveSpecDeltasDir", () => {
  test("prefers the shared dir, falls back to the per-checkout one when only it exists", () => {
    const common = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-common-"));
    const checkout = mkdtempSync(path.join(os.tmpdir(), "emet-specmerge-checkout-"));
    try {
      const shared = path.join(common, ".emet", "runs", "s1", "spec-deltas");
      const local = path.join(checkout, ".emet", "runs", "s1", "spec-deltas");
      expect(resolveSpecDeltasDir(common, checkout, "s1")).toBe(shared);
      mkdirSync(local, { recursive: true });
      expect(resolveSpecDeltasDir(common, checkout, "s1")).toBe(local);
      mkdirSync(shared, { recursive: true });
      expect(resolveSpecDeltasDir(common, checkout, "s1")).toBe(shared);
    } finally {
      rmSync(common, { recursive: true, force: true });
      rmSync(checkout, { recursive: true, force: true });
    }
  });
});
