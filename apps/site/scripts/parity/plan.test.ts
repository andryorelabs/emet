import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROGRESS_STEPS,
  REDUCED_SETTLE_MS,
  SECTIONS,
  SETTLE_MS,
  VARIANTS,
  captureFile,
  captureTargets,
  pairCaptures,
  progressSteps,
  scrollTarget,
  settleMs,
} from "./plan";

const desktop = "desktop-light-motion";
const fallback = {
  id: "x",
  viewport: { width: 1, height: 1 },
  scheme: "light",
  motion: "motion",
} as const;

describe("VARIANTS", () => {
  test("covers both viewports, schemes and motion preferences", () => {
    expect(VARIANTS.map((variant) => variant.id)).toEqual([
      "desktop-light-motion",
      "desktop-light-reduced",
      "desktop-dark-motion",
      "desktop-dark-reduced",
      "mobile-light-motion",
      "mobile-light-reduced",
      "mobile-dark-motion",
      "mobile-dark-reduced",
    ]);
    expect(VARIANTS[0]?.viewport).toEqual({ width: 1440, height: 900 });
    expect(VARIANTS[4]?.viewport).toEqual({ width: 390, height: 844 });
  });
});

describe("progressSteps", () => {
  test("uses per-section steps for how and showcase", () => {
    expect(progressSteps("how")).toEqual([0, 0.15, 0.45, 0.62, 1]);
    expect(progressSteps("showcase")).toEqual([0, 0.3, 0.7, 0.74, 1]);
  });

  test("uses the default steps elsewhere", () => {
    expect(progressSteps("faq")).toEqual(DEFAULT_PROGRESS_STEPS);
    expect(DEFAULT_PROGRESS_STEPS).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("settleMs", () => {
  test("settles longer with motion than with reduced motion", () => {
    expect(settleMs(VARIANTS.find((entry) => entry.motion === "motion") ?? fallback)).toBe(
      SETTLE_MS,
    );
    expect(settleMs(VARIANTS.find((entry) => entry.motion === "reduced") ?? fallback)).toBe(
      REDUCED_SETTLE_MS,
    );
  });
});

describe("captureTargets", () => {
  test("covers both sides, every section and its progress steps", () => {
    const targets = captureTargets(desktop);
    const perSide = SECTIONS.reduce((sum, entry) => sum + progressSteps(entry.name).length, 0);
    expect(targets).toHaveLength(2 * perSide);
    const hero = targets.filter((target) => target.section === "hero" && target.progress === 0);
    expect(hero.map((target) => [target.side, target.selector])).toEqual([
      ["prototype", "#hero"],
      ["site", ".hero"],
    ]);
    expect(targets.every((target) => target.variant === desktop)).toBe(true);
  });
});

describe("captureFile", () => {
  test("encodes side, variant, section and percent", () => {
    expect(captureFile("site", "mobile-dark-reduced", "faq", 0.25)).toBe(
      "site-mobile-dark-reduced-faq-25.png",
    );
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
  test("pairs both sides when everything was captured", () => {
    const targets = captureTargets(desktop);
    const { pairs, missing } = pairCaptures(targets, targets);
    expect(missing).toEqual([]);
    expect(pairs).toHaveLength(targets.length / 2);
    expect(pairs[0]).toEqual({
      variant: desktop,
      section: "hero",
      progress: 0,
      prototype: "prototype-desktop-light-motion-hero-0.png",
      site: "site-desktop-light-motion-hero-0.png",
    });
  });

  test("lists a capture missing on one side instead of dropping it", () => {
    const targets = captureTargets(desktop);
    const captured = targets.filter(
      (target) => !(target.side === "site" && target.section === "faq" && target.progress === 0.5),
    );
    const { pairs, missing } = pairCaptures(targets, captured);
    expect(missing).toEqual([{ variant: desktop, section: "faq", progress: 0.5, missing: "site" }]);
    expect(pairs).toHaveLength(targets.length / 2 - 1);
  });

  test("lists a prototype gap and both sides when neither was captured", () => {
    const targets = captureTargets(desktop);
    const onlySite = targets.filter((target) => target.side === "site");
    const result = pairCaptures(targets, onlySite);
    expect(result.pairs).toEqual([]);
    expect(result.missing.every((entry) => entry.missing === "prototype")).toBe(true);
    expect(pairCaptures(targets, []).missing).toHaveLength(targets.length);
  });
});
