import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./results";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "emet-results-run-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
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

const writeArgs = (status: string, risk = "Risk: none"): string[] => [
  "--run",
  "r1",
  "--root",
  root,
  "--write",
  "CLA-1",
  "--status",
  status,
  "--report",
  "report.md",
  "--risk",
  risk,
];

describe("emet results run", () => {
  test("prints usage and exits 2 without a run id", async () => {
    const result = await invoke([]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage: emet results");
  });

  test("rejects a run id containing a path separator", async () => {
    const result = await invoke(["--run", "a/b", "--root", root]);
    expect(result.code).toBe(2);
  });

  test("exits 2 with usage when neither --write nor --read is given", async () => {
    const result = await invoke(["--run", "r1", "--root", root]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage:");
  });

  test("writes a result then reads it back as JSON", async () => {
    const written = await invoke(writeArgs("DONE"));
    expect(written.code).toBe(0);
    const read = await invoke(["--run", "r1", "--root", root, "--read", "CLA-1"]);
    expect(read.code).toBe(0);
    expect(JSON.parse(read.out[0]!)).toEqual({
      status: "DONE",
      reportPath: "report.md",
      risk: "Risk: none",
    });
  });

  test("writes the file under the run's results directory", async () => {
    await invoke(writeArgs("BLOCKED", "Risk: item 1 (x)"));
    const file = path.join(root, ".emet", "runs", "r1", "results", "CLA-1.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ status: "BLOCKED" });
  });

  test("write with a missing flag exits 2 with usage", async () => {
    const result = await invoke(["--run", "r1", "--root", root, "--write", "CLA-1"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("usage:");
  });

  test("write with an unknown status exits 1 naming the status", async () => {
    const result = await invoke(writeArgs("MAYBE"));
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain('invalid status "MAYBE"');
  });

  test("write with a malformed risk line exits 1", async () => {
    const result = await invoke(writeArgs("DONE", "nope"));
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("risk line");
  });

  test("read of a missing result exits 1", async () => {
    const result = await invoke(["--run", "r1", "--root", root, "--read", "CLA-9"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("no result for CLA-9");
  });

  test("read with an invalid ticket id exits 1", async () => {
    const result = await invoke(["--run", "r1", "--root", root, "--read", "../x"]);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("invalid ticket id");
  });
});
