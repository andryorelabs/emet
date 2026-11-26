import { describe, expect, test } from "bun:test";

import {
  PROGRESS_STEPS,
  SECTIONS,
  captureFile,
  captureTargets,
  pairCaptures,
  scrollTarget,
} from "./plan";

describe("captureTargets", () => {
  test("covers both sides, every section and progress", () => {
    const targets = captureTargets();
    expect(targets).toHaveLength(2 * SECTIONS.length * PROGRESS_STEPS.length);
    const hero = targets.filter((target) => target.section === "hero" && target.progress === 0);
    expect(hero.map((target) => [target.side, target.selector])).toEqual([
      ["prototype", "#hero"],
      ["site", ".hero"],
    ]);
  });
});

describe("captureFile", () => {
  test("encodes side, section and percent", () => {
    expect(captureFile("site", "faq", 0.25)).toBe("site-faq-25.png");
  });
});

describe("scrollTarget", () => {
  test("interpolates across the scrollable range", () => {
    expect(scrollTarget(1000, 3000, 1000, 0)).toBe(1000);
    expect(scrollTarget(1000, 3000, 1000, 0.5)).toBe(2000);
    expect(scrollTarget(1000, 3000, 1000, 1)).toBe(3000);
  });

  test("keeps a short section at its top", () => {
    expect(scrollTarget(500, 400, 1000, 1)).toBe(500);
  });
});

describe("pairCaptures", () => {
  test("pairs both sides and drops unmatched captures", () => {
    const targets = captureTargets();
    expect(pairCaptures(targets)).toHaveLength(SECTIONS.length * PROGRESS_STEPS.length);
    const onlyPrototype = targets.filter((target) => target.side === "prototype");
    expect(pairCaptures(onlyPrototype)).toEqual([]);
    expect(pairCaptures(targets)[0]).toEqual({
      section: "hero",
      progress: 0,
      prototype: "prototype-hero-0.png",
      site: "site-hero-0.png",
    });
  });
});
