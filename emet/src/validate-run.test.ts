import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { currentExitCode } from "./exit-code";
import { run } from "./validate";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-validate-run-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  process.exitCode = 0;
});

async function invoke(
  argv: string[],
  deps: { ghCommand?: string } = {},
): Promise<{ out: string[]; err: string[]; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation(
    (...args) => void out.push(args.join(" ")),
  );
  const errorSpy = spyOn(console, "error").mockImplementation(
    (...args) => void err.push(args.join(" ")),
  );
  process.exitCode = 0;
  try {
    await run(argv, deps);
    return { out, err, code: currentExitCode() };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

const SPEC = "## Specs\n- **S1**: thing.\n  Scenario: WHEN x THEN y\n";

function writePlan(plan: unknown): string {
  const file = path.join(directory, "plan.json");
  writeFileSync(file, JSON.stringify(plan));
  return file;
}

describe("validate run", () => {
  test("exits 2 with usage without --file or --spec", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage: emet validate");
  });

  test("a valid plan prints ok JSON and exits 0", async () => {
    const file = writePlan({
      spec: SPEC,
      tickets: [{ id: "A", covers: ["S1"], surfaces: ["src/a.ts"] }],
    });
    const result = await invoke(["--file", file]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out[0] ?? "")).toEqual({ ok: true, findings: [] });
  });

  test("an uncovered spec item exits 1 and reports the finding", async () => {
    const file = writePlan({ spec: SPEC, tickets: [] });
    const result = await invoke(["--file", file]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out[0] ?? "")).toMatchObject({
      findings: [{ code: "uncovered-spec-item" }],
    });
    expect(result.err[0]).toStartWith("error:");
  });

  test("a plan without a spec string exits 2", async () => {
    const result = await invoke(["--file", writePlan({ tickets: [] })]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('plan needs a "spec" string');
  });

  test("a ticket without an id exits 2", async () => {
    const result = await invoke(["--file", writePlan({ spec: SPEC, tickets: [{}] })]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('needs an "id"');
  });

  test("non-array tickets exit 2", async () => {
    const result = await invoke(["--file", writePlan({ spec: SPEC, tickets: "x" })]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('"tickets" must be an array');
  });

  test("a non-string-array field exits 2 naming the field", async () => {
    const file = writePlan({ spec: SPEC, tickets: [{ id: "A", covers: [1] }] });
    const result = await invoke(["--file", file]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("A.covers must be string[]");
  });

  test("optional numeric fields and folded flow through to a passing plan", async () => {
    const file = writePlan({
      spec: SPEC,
      sizing: { inlineMaxLines: 10 },
      tickets: [
        {
          id: "A",
          covers: ["S1"],
          surfaces: ["src/a.ts"],
          wave: 2,
          blockedBy: [],
          newSurfaceLines: 5,
          estimatedPeakTokens: 1000,
          folded: true,
        },
      ],
    });
    const result = await invoke(["--file", file]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out[0] ?? "")).toMatchObject({ ok: true });
  });

  test("an unreadable plan file exits 2", async () => {
    const result = await invoke(["--file", path.join(directory, "missing.json")]);
    expect(result.code).toBe(2);
  });
});

function fakeGh(exitCode: number, body: string): { ghCommand: string } {
  const script = path.join(directory, "gh");
  writeFileSync(script, `#!/bin/sh\ncat <<'EOF'\n${body}\nEOF\nexit ${exitCode}\n`);
  chmodSync(script, 0o755);
  return { ghCommand: script };
}

function writeTickets(tickets: unknown): string {
  const file = path.join(directory, "tickets.json");
  writeFileSync(file, JSON.stringify(tickets));
  return file;
}

function initRepo(kind: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
  writeFileSync(path.join(directory, "emet.config.json"), JSON.stringify({ tracker: { kind } }));
  process.chdir(directory);
}

describe("validate run --spec", () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  const passingTickets = [{ id: "A", covers: ["S1"], surfaces: ["src/a.ts"] }];

  test("reads the spec through gh when the cwd is not a repo", async () => {
    const plain = mkdtempSync(path.join(os.tmpdir(), "emet-validate-plain-"));
    try {
      process.chdir(plain);
      const result = await invoke(
        ["--spec", "7", "--tickets", writeTickets(passingTickets)],
        fakeGh(0, SPEC),
      );
      expect(result.err).toEqual([]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out[0] ?? "")).toEqual({ ok: true, findings: [] });
    } finally {
      process.chdir(originalCwd);
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("exits 2 when gh cannot read the spec issue", async () => {
    const plain = mkdtempSync(path.join(os.tmpdir(), "emet-validate-plain-"));
    try {
      process.chdir(plain);
      const result = await invoke(["--spec", "7", "--tickets", writeTickets([])], fakeGh(1, ""));
      expect(result.code).toBe(2);
      expect(result.err.join("\n")).toContain("could not read spec issue 7");
    } finally {
      process.chdir(originalCwd);
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("reads the spec from .scratch when the tracker is local", async () => {
    initRepo("local");
    mkdirSync(path.join(directory, ".scratch", "my-spec"), { recursive: true });
    writeFileSync(path.join(directory, ".scratch", "my-spec", "spec.md"), SPEC);
    const result = await invoke(["--spec", "my-spec", "--tickets", writeTickets(passingTickets)]);
    expect(result.err).toEqual([]);
    expect(JSON.parse(result.out[0] ?? "")).toMatchObject({ ok: true });
  });

  test("a local tracker rejects a spec slug that is not a slug", async () => {
    initRepo("local");
    const result = await invoke(["--spec", "../evil", "--tickets", writeTickets([])]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain('invalid spec slug "../evil"');
  });

  test("a local tracker without the spec file exits 2", async () => {
    initRepo("local");
    const result = await invoke(["--spec", "absent", "--tickets", writeTickets([])]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("could not read local spec");
  });

  test("a non-local tracker inside a repo goes through gh", async () => {
    initRepo("github");
    const result = await invoke(
      ["--spec", "9", "--tickets", writeTickets(passingTickets)],
      fakeGh(0, SPEC),
    );
    expect(result.err).toEqual([]);
    expect(result.code).toBe(0);
  });
});
