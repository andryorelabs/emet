import { describe, expect, test } from "bun:test";

import { frameInset, growEase, headingOpacity, panelOpacity } from "./grow";

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

describe("growEase", () => {
  test("eases the grow from 0 at the start to 1 at 40%", () => {
    expect(growEase(0)).toBe(0);
    expect(growEase(0.2)).toBeCloseTo(0.5);
    expect(growEase(0.4)).toBe(1);
    expect(growEase(2)).toBe(1);
  });
});

describe("panelOpacity", () => {
  test("follows (e - 0.7) / 0.3 on the eased grow value", () => {
    expect(panelOpacity(0)).toBe(0);
    expect(panelOpacity(0.2)).toBe(0);
    expect(panelOpacity(0.4)).toBe(1);
    expect(panelOpacity(1)).toBe(1);
    const progress = 0.3;
    expect(panelOpacity(progress)).toBeCloseTo((growEase(progress) - 0.7) / 0.3);
  });

  test("is visible from about 25% and full at 40%", () => {
    expect(panelOpacity(0.25)).toBe(0);
    expect(panelOpacity(0.27)).toBeGreaterThan(0);
    expect(panelOpacity(0.4)).toBe(1);
  });
});

describe("headingOpacity", () => {
  test("is clamp(e * 1.6): fully visible from e = 0.625", () => {
    expect(headingOpacity(0)).toBe(0);
    expect(headingOpacity(0.2)).toBeCloseTo(0.8);
    expect(headingOpacity(0.3)).toBe(1);
    expect(headingOpacity(1)).toBe(1);
  });
});
