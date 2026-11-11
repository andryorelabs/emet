import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./validate";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-validate-run-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  process.exitCode = 0;
});

async function invoke(argv: string[]): Promise<{ out: string[]; err: string[]; code: number }> {
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
    await run(argv);
    return { out, err, code: process.exitCode ?? 0 };
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
    expect(JSON.parse(result.out[0]!)).toEqual({ ok: true, findings: [] });
  });

  test("an uncovered spec item exits 1 and reports the finding", async () => {
    const file = writePlan({ spec: SPEC, tickets: [] });
    const result = await invoke(["--file", file]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({
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
    expect(JSON.parse(result.out[0]!)).toMatchObject({ ok: true });
  });

  test("an unreadable plan file exits 2", async () => {
    const result = await invoke(["--file", path.join(directory, "missing.json")]);
    expect(result.code).toBe(2);
  });
});
