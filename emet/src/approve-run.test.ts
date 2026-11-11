import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkApproval, run } from "./approve";
import { resolveRunArtifactPath } from "./runs";

let root: string;
let specPath: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "approve-run-")));
  specPath = path.join(root, "spec.md");
  writeFileSync(specPath, "spec");
});

afterEach(() => {
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

async function runApprove(
  argv: string[],
): Promise<{ logs: string[]; errors: string[]; code: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line: string) => void logs.push(line);
  console.error = (line: unknown) => void errors.push(String(line));
  process.exitCode = 0;
  try {
    await run(argv);
    return { logs, errors, code: process.exitCode ?? 0 };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = 0;
  }
}

describe("approve run()", () => {
  test.each([[[]], [["--run", ""]], [["--run", "a/b"]], [["--run", ".."]]] as string[][][])(
    "a missing or path-like --run (%j) exits 2 with usage",
    async (argv) => {
      const result = await runApprove(argv);
      expect(result.code).toBe(2);
      expect(result.errors).toHaveLength(1);
    },
  );

  test("--check with no record reports not ok and exits 1", async () => {
    const result = await runApprove(["--run", "r1", "--root", root, "--check"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.logs[0]!)).toMatchObject({
      ok: false,
      reasons: [expect.stringContaining("no approval record")],
    });
  });

  test("approving without --spec exits 2", async () => {
    const result = await runApprove(["--run", "r1", "--root", root]);
    expect(result.code).toBe(2);
    expect(result.logs).toEqual([]);
  });

  test("approve then --check passes, and fails once the spec changes", async () => {
    const ticketsPath = path.join(root, "tickets.json");
    writeFileSync(ticketsPath, "[]");
    const approved = await runApprove([
      "--run",
      "r1",
      "--root",
      root,
      "--spec",
      specPath,
      "--tickets",
      ticketsPath,
    ]);
    expect(approved.code).toBe(0);
    const record: unknown = JSON.parse(approved.logs[0]!);
    expect(record).toMatchObject({ specPath });
    const { writePath } = await resolveRunArtifactPath("r1", "approval.json", { repoRoot: root });
    expect(JSON.parse(readFileSync(writePath, "utf8"))).toEqual(record);

    const ok = await runApprove(["--run", "r1", "--root", root, "--check"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.logs[0]!)).toEqual({ ok: true, reasons: [] });

    writeFileSync(specPath, "changed");
    const stale = await runApprove(["--run", "r1", "--root", root, "--check"]);
    expect(stale.code).toBe(1);
    expect(JSON.parse(stale.logs[0]!)).toMatchObject({
      ok: false,
      reasons: [expect.stringContaining("spec changed since approval")],
    });
  });

  test("a missing spec file is reported and exits 1", async () => {
    const result = await runApprove([
      "--run",
      "r1",
      "--root",
      root,
      "--spec",
      path.join(root, "nope.md"),
      "--tickets",
      specPath,
    ]);
    expect(result.code).toBe(1);
    expect(result.errors[0]).toContain("emet approve:");
  });
});

function recordAt(content: string): string {
  const file = path.join(root, "run", "approval.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

describe("checkApproval malformed records", () => {
  test("a non-object record is missing fields", () => {
    const result = checkApproval(recordAt("[1]"));
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toContain("missing fields");
  });

  test("a record with a non-string field is missing fields", () => {
    const result = checkApproval(recordAt(JSON.stringify({ specPath: 1 })));
    expect(result.reasons[0]).toContain("missing fields");
  });

  test("invalid JSON is unreadable", () => {
    const result = checkApproval(recordAt("{nope"));
    expect(result.reasons[0]).toContain("is unreadable");
  });

  test("a deleted tracked file is reported as missing", () => {
    const record = {
      specPath: path.join(root, "gone-spec.md"),
      ticketsPath: path.join(root, "gone-tickets.json"),
      specHash: "x",
      ticketsHash: "y",
      approvedAt: "2020-01-01T00:00:00.000Z",
    };
    const result = checkApproval(recordAt(JSON.stringify(record)));
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toContain("spec file is missing");
    expect(result.reasons[1]).toContain("tickets file is missing");
  });
});
