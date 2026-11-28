import { describe, expect, it } from "bun:test";

import { clamp01, coverProgress, heroZoom, isSmoothScrollExempt, motionPolicy } from "./policy";

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

  it("zooms the hero painting from 1 to 1.08 over one viewport of scroll", () => {
    expect(heroZoom(0, 900)).toBe(1);
    expect(heroZoom(450, 900)).toBeCloseTo(1.04, 10);
    expect(heroZoom(900, 900)).toBeCloseTo(1.08, 10);
    expect(heroZoom(2700, 900)).toBeCloseTo(1.08, 10);
    expect(heroZoom(-50, 900)).toBe(1);
    expect(heroZoom(300, 0)).toBe(1);
  });
});

/**
 * Builds a minimal element stand-in carrying only a tag name.
 * @param tagName - The upper-case tag name.
 * @returns A tag-name-only element stand-in.
 */
function elementNamed(tagName: string): Pick<Element, "tagName"> {
  return { tagName };
}

describe("isSmoothScrollExempt", () => {
  it("exempts a dialog", () => {
    expect(isSmoothScrollExempt(elementNamed("DIALOG"))).toBe(true);
  });

  it("does not exempt page-level elements", () => {
    for (const tag of ["html", "body", "main", "section", "div"]) {
      expect(isSmoothScrollExempt(elementNamed(tag.toUpperCase()))).toBe(false);
    }
  });
});
