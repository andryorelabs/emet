import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readResult, writeResult } from "./results";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "forge-results-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

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
    expect(() => {
      writeResult(directory, "CLA-1", {
        // @ts-expect-error deliberately invalid status
        status: "FINE",
        reportPath: "r.md",
        risk: "Risk: none",
      });
    }).toThrow(/status/);
  });

  test("rejects a risk line that does not start with Risk:", () => {
    expect(() => {
      writeResult(directory, "CLA-1", { status: "DONE", reportPath: "r.md", risk: "none" });
    }).toThrow(/risk/i);
  });

  test("reading a missing result returns null", () => {
    expect(readResult(directory, "CLA-9")).toBeNull();
  });

  test("rejects a stored file that is not a JSON object", () => {
    writeFileSync(path.join(directory, "CLA-2.json"), "5");
    expect(() => readResult(directory, "CLA-2")).toThrow(/not a JSON object/);
  });

  test("rejects a stored file with an unknown status", () => {
    writeFileSync(
      path.join(directory, "CLA-3.json"),
      JSON.stringify({ status: "FINE", reportPath: "r.md", risk: "Risk: none" }),
    );
    expect(() => readResult(directory, "CLA-3")).toThrow(/invalid status "FINE"/);
  });

  test("rejects a stored file whose report path or risk is not a string", () => {
    writeFileSync(
      path.join(directory, "CLA-4.json"),
      JSON.stringify({ status: "DONE", reportPath: 1, risk: "Risk: none" }),
    );
    expect(() => readResult(directory, "CLA-4")).toThrow(/must be strings/);
  });

  test("rejects an empty report path", () => {
    expect(() => {
      writeResult(directory, "CLA-5", { status: "DONE", reportPath: "  ", risk: "Risk: none" });
    }).toThrow(/report path is empty/);
  });

  test("rejects ticket ids that escape the directory", () => {
    expect(() => readResult(directory, "../x")).toThrow(/ticket/);
  });
});
