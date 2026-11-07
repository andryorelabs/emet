import { describe, expect, it } from "bun:test";

import { clamp01, coverProgress, exitProgress, motionPolicy } from "./policy";

describe("motionPolicy", () => {
  it("turns everything off with reduced motion", () => {
    expect(
      motionPolicy({ reducedMotion: true, coarsePointer: false, hasViewTimeline: true }),
    ).toEqual({ enabled: false, smoothScroll: false, scrollFallback: false });
  });

  it("keeps smooth scroll off on touch devices", () => {
    expect(
      motionPolicy({ reducedMotion: false, coarsePointer: true, hasViewTimeline: true }),
    ).toEqual({ enabled: true, smoothScroll: false, scrollFallback: false });
  });

  it("asks for the scroll fallback only without view timelines", () => {
    expect(
      motionPolicy({ reducedMotion: false, coarsePointer: false, hasViewTimeline: false }),
    ).toEqual({ enabled: true, smoothScroll: true, scrollFallback: true });
  });
});

describe("scroll progress", () => {
  it("clamps to the unit range", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it("covers from entry to exit", () => {
    expect(coverProgress({ top: 800, height: 400 }, 800)).toBe(0);
    expect(coverProgress({ top: -400, height: 400 }, 800)).toBe(1);
    expect(coverProgress({ top: 200, height: 400 }, 800)).toBe(0.5);
  });

  it("exits from the moment the top meets the viewport top", () => {
    expect(exitProgress({ top: 0, height: 800 })).toBe(0);
    expect(exitProgress({ top: -400, height: 800 })).toBe(0.5);
    expect(exitProgress({ top: 100, height: 800 })).toBe(0);
  });
});
