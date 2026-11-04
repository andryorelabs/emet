import { describe, expect, test } from "bun:test";
import { mapGateExitCode } from "./check-map";

describe("mapGateExitCode", () => {
  test("passes a fresh map", () => {
    expect(mapGateExitCode(0, "fresh: 0 commits")).toBe(0);
  });

  test("fails a map that is stale by commit count", () => {
    expect(
      mapGateExitCode(1, "stale: 11 commits touching mapped areas since abc1234 (max 10)"),
    ).toBe(1);
  });

  test("tolerates a stamp that a squash merge dropped from history", () => {
    expect(mapGateExitCode(1, "stale: stamped commit abc1234 not in history")).toBe(0);
  });
});
