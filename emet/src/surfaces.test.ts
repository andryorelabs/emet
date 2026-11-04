import { describe, expect, test } from "bun:test";

import { findSurfaceOverlaps, globsOverlap, parseTicketSurfaces } from "./surfaces";

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
