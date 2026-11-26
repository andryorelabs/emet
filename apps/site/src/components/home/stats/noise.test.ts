import { describe, expect, test } from "bun:test";

import { createNoise } from "./noise";

describe("createNoise", () => {
  test("is stable for a seed and differs between seeds", () => {
    const a = createNoise(26);
    const again = createNoise(26);
    const other = createNoise(27);
    expect(a(1.3, 2.7, 0.4)).toBe(again(1.3, 2.7, 0.4));
    expect(a(1.3, 2.7, 0.4)).not.toBe(other(1.3, 2.7, 0.4));
  });

  test("stays within about -1 to 1 and varies across the field", () => {
    const noise = createNoise(26);
    const values: number[] = [];
    for (let i = 0; i < 400; i++) values.push(noise(i * 0.37, i * 0.11 + 3, i * 0.05));
    expect(Math.max(...values)).toBeLessThan(1.2);
    expect(Math.min(...values)).toBeGreaterThan(-1.2);
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(300);
  });

  test("treats a zero seed like seed one", () => {
    expect(createNoise(0)(0.5, 0.5, 0.5)).toBe(createNoise(1)(0.5, 0.5, 0.5));
  });

  test("is zero on the integer lattice", () => {
    expect(createNoise(26)(3, 4, 5)).toBe(0);
  });
});
