import { describe, expect, test } from "bun:test";

import { strikeProgress } from "./strike";

describe("strikeProgress", () => {
  test("is zero while the section sits below the strike start", () => {
    expect(strikeProgress(900, 1000)).toBe(0);
    expect(strikeProgress(2000, 1000)).toBe(0);
  });

  test("is complete once the section is well up the viewport", () => {
    expect(strikeProgress(0, 1000)).toBe(1);
    expect(strikeProgress(-500, 1000)).toBe(1);
  });

  test("rises monotonically between the two", () => {
    const early = strikeProgress(650, 1000);
    const late = strikeProgress(500, 1000);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(1);
  });

  test("is complete in a viewport with no height", () => {
    expect(strikeProgress(0, 0)).toBe(1);
  });
});
