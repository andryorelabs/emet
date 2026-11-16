import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findSurfaceOverlaps, globsOverlap, parseTicketSurfaces, run } from "./surfaces";

describe("parseTicketSurfaces errors", () => {
  test("rejects malformed array entries and glob lists", () => {
    expect(() => parseTicketSurfaces([{ ticket: "A", surfaces: [1] }])).toThrow("entry 0");
    expect(() => parseTicketSurfaces(["x"])).toThrow("entry 0");
    expect(() => parseTicketSurfaces({ A: "x" })).toThrow("A needs string[] globs");
    expect(() => parseTicketSurfaces(null)).toThrow("expected an object or array");
  });
});

function fixture(content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "surfaces-")), "in.json");
  writeFileSync(file, content);
  return file;
}

describe("run", () => {
  afterEach(() => {
    process.exitCode = 0;
  });
  test("prints usage and exits 2 without --check", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    await run([]);
    expect(error).toHaveBeenCalledWith("usage: emet surfaces --check <file.json | ->");
    expect(process.exitCode).toBe(2);
    error.mockRestore();
  });
  test("reports ok for disjoint surfaces", async () => {
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    await run(["--check", fixture('{"A":["a/*.ts"],"B":["b/*.ts"]}')]);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ ok: true, overlaps: [] }));
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });
  test("reports overlaps and exits 1", async () => {
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    await run(["--check", fixture('{"A":["a/**"],"B":["a/x.ts"]}')]);
    expect(error).toHaveBeenCalledWith("overlap: A (a/**) <-> B (a/x.ts)");
    expect(String(log.mock.calls[0]?.[0])).toContain('"ok":false');
    expect(process.exitCode).toBe(1);
    log.mockRestore();
    error.mockRestore();
  });
  test("exits 2 on invalid JSON and unreadable files", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    await run(["--check", fixture("not json")]);
    expect(process.exitCode).toBe(2);
    await run(["--check", "/nonexistent/file.json"]);
    expect(process.exitCode).toBe(2);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("globsOverlap", () => {
  test("detects overlaps", () => {
    expect(globsOverlap("emet/src/**", "emet/src/guard.ts")).toBe(true);
    expect(globsOverlap("emet/src/guard*.ts", "emet/src/guard.test.ts")).toBe(true);
    expect(globsOverlap("a/**/x.ts", "a/b/c/*.ts")).toBe(true);
    expect(globsOverlap("src/{a,b}/*.ts", "src/b/*.ts")).toBe(true);
    expect(globsOverlap("**", "anything/here.md")).toBe(true);
  });
  test("detects disjoint globs", () => {
    expect(globsOverlap("emet/src/guard*.ts", "emet/src/surfaces*.ts")).toBe(false);
    expect(globsOverlap("docs/**", "forge/**")).toBe(false);
    expect(globsOverlap("a/*.ts", "a/b/c.ts")).toBe(false);
    expect(globsOverlap("src/*.ts", "src/*.md")).toBe(false);
  });
});

describe("findSurfaceOverlaps", () => {
  test("names the offending pair", () => {
    const overlaps = findSurfaceOverlaps([
      { ticket: "CLA-1", surfaces: ["emet/src/guard*.ts"] },
      { ticket: "CLA-2", surfaces: ["docs/**", "emet/src/**"] },
      { ticket: "CLA-3", surfaces: ["README.md"] },
    ]);
    expect(overlaps).toEqual([
      { ticketA: "CLA-1", globA: "emet/src/guard*.ts", ticketB: "CLA-2", globB: "emet/src/**" },
    ]);
  });
  test("parses both input shapes", () => {
    expect(parseTicketSurfaces({ A: ["x"] })).toEqual([{ ticket: "A", surfaces: ["x"] }]);
    expect(parseTicketSurfaces([{ ticket: "A", surfaces: ["x"] }])).toEqual([
      { ticket: "A", surfaces: ["x"] },
    ]);
    expect(() => parseTicketSurfaces("nope")).toThrow();
  });
});
