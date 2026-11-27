/** Which build a capture was taken from. */
export type Side = "prototype" | "site";

/** The page width and height of a capture variant. */
interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** One browser configuration: a viewport, a colour scheme and a motion preference. */
export interface Variant {
  readonly id: string;
  readonly viewport: Viewport;
  readonly scheme: "light" | "dark";
  readonly motion: "motion" | "reduced";
}

/** One screenshot to take: a section of one side at a scroll progress under one variant. */
export interface Capture {
  readonly side: Side;
  readonly variant: string;
  readonly section: string;
  readonly selector: string;
  readonly progress: number;
  readonly file: string;
}

const VIEWPORTS: readonly { readonly name: string; readonly viewport: Viewport }[] = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

/** Every browser configuration captured: both viewports, both colour schemes, motion and reduced motion. */
export const VARIANTS: readonly Variant[] = VIEWPORTS.flatMap(({ name, viewport }) =>
  (["light", "dark"] as const).flatMap((scheme) =>
    (["motion", "reduced"] as const).map((motion) => ({
      id: `${name}-${scheme}-${motion}`,
      viewport,
      scheme,
      motion,
    })),
  ),
);

/** The sections compared, with the selector of each on both sides. */
export const SECTIONS: readonly {
  readonly name: string;
  readonly prototype: string;
  readonly site: string;
}[] = [
  { name: "hero", prototype: "#hero", site: ".hero" },
  { name: "how", prototype: "#how", site: "#how" },
  { name: "showcase", prototype: "#show", site: "#showcase" },
  { name: "features", prototype: "#guards", site: ".features" },
  { name: "stats", prototype: "#stats", site: ".stats" },
  { name: "about", prototype: "#about", site: ".about" },
  { name: "faq", prototype: "#faq", site: "[data-faq]" },
  { name: "closing", prototype: "#close", site: ".closing" },
];

/** The scroll progresses captured for sections without their own steps. */
export const DEFAULT_PROGRESS_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** The scroll progresses of the sections whose motion has its own beats. */
const SECTION_PROGRESS_STEPS: Readonly<Record<string, readonly number[]>> = {
  how: [0, 0.15, 0.45, 0.62, 1],
  showcase: [0, 0.3, 0.7, 0.74, 1],
};

/** The scroll progresses at which a section is captured on both sides. */
export function progressSteps(section: string): readonly number[] {
  return SECTION_PROGRESS_STEPS[section] ?? DEFAULT_PROGRESS_STEPS;
}

/** Milliseconds to wait after a scroll so smooth scrolling and effects settle. */
export const SETTLE_MS = 1600;

/** Milliseconds to wait after a scroll when motion is reduced and little needs to settle. */
export const REDUCED_SETTLE_MS = 500;

/** The settle time of a variant. */
export function settleMs(variant: Variant): number {
  return variant.motion === "reduced" ? REDUCED_SETTLE_MS : SETTLE_MS;
}

/** The file name of a capture, without a directory. */
export function captureFile(
  side: Side,
  variant: string,
  section: string,
  progress: number,
): string {
  return `${side}-${variant}-${section}-${Math.round(progress * 100)}.png`;
}

/** Every capture of both sides under one variant: each section at each of its progress steps. */
export function captureTargets(variant: string): Capture[] {
  const sides: readonly Side[] = ["prototype", "site"];
  return sides.flatMap((side) =>
    SECTIONS.flatMap((entry) =>
      progressSteps(entry.name).map((progress) => ({
        side,
        variant,
        section: entry.name,
        selector: entry[side],
        progress,
        file: captureFile(side, variant, entry.name, progress),
      })),
    ),
  );
}

/**
 * Section-aligned framing. Both sides are scrolled to the same fraction of the
 * section's own scrollable range, then, once smooth scrolling has settled, the
 * section's live box is read back and the screenshot is clipped to it,
 * intersected with the viewport (`sectionClip`). A capture therefore shows only
 * the section itself, never the neighbouring section that happens to share the
 * viewport, and a section shorter than the viewport is framed on its own box
 * instead of on whatever sits below it. The clip is read after the scroll so a
 * page that clamps the scroll at its end still frames the real box.
 */

/** A pixel box in viewport coordinates. */
export interface ClipBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of a section's box that is inside the viewport, or null when nothing of it is visible. */
export function sectionClip(
  sectionTop: number,
  sectionHeight: number,
  viewport: Viewport,
): ClipBox | null {
  const top = Math.max(0, Math.floor(sectionTop));
  const bottom = Math.min(viewport.height, Math.ceil(sectionTop + sectionHeight));
  if (bottom <= top) return null;
  return { x: 0, y: top, width: viewport.width, height: bottom - top };
}

/**
 * Both clips start at the section's top edge, so a pair is compared on the
 * pixel rows both sides have, `commonHeight`, instead of stretching the shorter
 * capture over the taller one.
 */

/** The height both captures of a pair are compared on: the shorter of the two. */
export function commonHeight(prototypeHeight: number, siteHeight: number): number {
  return Math.min(prototypeHeight, siteHeight);
}

/** The capture width of a variant id such as `mobile-dark-reduced`. */
export function variantWidth(variantId: string): number {
  const match = VARIANTS.find((variant) => variant.id === variantId);
  return match?.viewport.width ?? VIEWPORTS[0]?.viewport.width ?? 0;
}

/** The scroll offset that puts a section at `progress` of its scrollable range; a section no taller than the viewport stays at its top. */
export function scrollTarget(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  progress: number,
): number {
  return sectionTop + Math.max(0, sectionHeight - viewportHeight) * progress;
}

/** A prototype capture and the site capture of the same variant, section and progress. */
interface CapturePair {
  readonly variant: string;
  readonly section: string;
  readonly progress: number;
  readonly prototype: string;
  readonly site: string;
}

/** A capture that exists on one side only. */
export interface MissingCapture {
  readonly variant: string;
  readonly section: string;
  readonly progress: number;
  readonly missing: Side;
}

/** The paired and the one-sided captures of a run. */
export interface Pairing {
  readonly pairs: readonly CapturePair[];
  readonly missing: readonly MissingCapture[];
}

/** Pairs the expected captures that were taken on both sides, and lists each expected capture that was not taken as missing on its side. */
export function pairCaptures(expected: readonly Capture[], captured: readonly Capture[]): Pairing {
  const taken = new Set(captured.map((capture) => capture.file));
  const sites = new Map(
    expected
      .filter((capture) => capture.side === "site")
      .map((capture) => [`${capture.variant}@${capture.section}@${capture.progress}`, capture]),
  );
  const pairs: CapturePair[] = [];
  const missing: MissingCapture[] = [];
  for (const capture of expected) {
    const site = sites.get(`${capture.variant}@${capture.section}@${capture.progress}`);
    if (taken.has(capture.file)) {
      if (capture.side === "prototype" && site !== undefined && taken.has(site.file)) {
        pairs.push({
          variant: capture.variant,
          section: capture.section,
          progress: capture.progress,
          prototype: capture.file,
          site: site.file,
        });
      }
    } else {
      missing.push({
        variant: capture.variant,
        section: capture.section,
        progress: capture.progress,
        missing: capture.side,
      });
    }
  }
  return { pairs, missing };
}
