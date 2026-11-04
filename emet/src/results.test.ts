import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readResult, writeResult } from "./results";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "forge-results-"));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("worker results", () => {
  test("round-trips a result", () => {
    writeResult(directory, "CLA-1", {
      status: "DONE",
      reportPath: ".forge/report-CLA-1.md",
      risk: "Risk: none",
    });
    expect(readResult(directory, "CLA-1")).toEqual({
      status: "DONE",
      reportPath: ".forge/report-CLA-1.md",
      risk: "Risk: none",
    });
  });

  test("rejects an unknown status", () => {
    expect(() =>
      writeResult(directory, "CLA-1", {
        // @ts-expect-error deliberately invalid status
        status: "FINE",
        reportPath: "r.md",
        risk: "Risk: none",
      }),
    ).toThrow(/status/);
  });

  test("rejects a risk line that does not start with Risk:", () => {
    expect(() =>
      writeResult(directory, "CLA-1", { status: "DONE", reportPath: "r.md", risk: "none" }),
    ).toThrow(/risk/i);
  });

  test("reading a missing result returns null", () => {
    expect(readResult(directory, "CLA-9")).toBeNull();
  });

  test("rejects ticket ids that escape the directory", () => {
    expect(() => readResult(directory, "../x")).toThrow(/ticket/);
  });
});
