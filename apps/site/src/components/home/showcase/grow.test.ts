import { describe, expect, test } from "bun:test";

import { frameInset, panelOpacity } from "./grow";

describe("frameInset", () => {
  test("starts as an inset card with all four marks visible", () => {
    expect(frameInset(0)).toEqual({ x: 18, y: 18, radius: 10, marks: 1 });
  });

  test("is full bleed with no marks from 40% on", () => {
    expect(frameInset(0.4)).toEqual({ x: 0, y: 0, radius: 0, marks: 0 });
    expect(frameInset(1)).toEqual({ x: 0, y: 0, radius: 0, marks: 0 });
  });

  test("shrinks monotonically in between and halves at the midpoint", () => {
    expect(frameInset(0.2).x).toBeCloseTo(9);
    expect(frameInset(0.1).x).toBeGreaterThan(frameInset(0.3).x);
    expect(frameInset(0.2).marks).toBeCloseTo(0.5);
  });

  test("clamps progress outside 0..1", () => {
    expect(frameInset(-3)).toEqual(frameInset(0));
    expect(frameInset(9)).toEqual(frameInset(1));
  });
});

describe("panelOpacity", () => {
  test("is hidden before 70% and opaque from 80%", () => {
    expect(panelOpacity(0.5)).toBe(0);
    expect(panelOpacity(0.7)).toBe(0);
    expect(panelOpacity(0.75)).toBeCloseTo(0.5);
    expect(panelOpacity(0.8)).toBe(1);
    expect(panelOpacity(1)).toBe(1);
  });
});
