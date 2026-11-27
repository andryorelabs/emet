/**
 * Pure geometry of the showcase frame while its runway scrolls: the painting
 * grows from an inset card to full bleed while the heading and then the glass
 * panel fade in on the eased grow value.
 */

export interface FrameInset {
  /** Horizontal inset on each side, in vw. */
  x: number;
  /** Vertical inset on each side, in vh. */
  y: number;
  /** Corner radius in px. */
  radius: number;
  /** Opacity of the four crop marks, 1 while inset and 0 at full bleed. */
  marks: number;
}

const MAX_INSET = 18;
const MAX_RADIUS = 10;
const GROW_END = 0.4;
const PANEL_START = 0.7;
const PANEL_SPAN = 0.3;
const HEADING_GAIN = 1.6;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** The eased grow value in 0..1: smoothstep over the first 40% of the runway. */
export function growEase(progress: number): number {
  return smoothstep(clamp(progress / GROW_END));
}

/** The frame inset, radius and crop-mark opacity at a runway progress in 0..1. */
export function frameInset(progress: number): FrameInset {
  const remaining = 1 - growEase(progress);
  return {
    x: MAX_INSET * remaining,
    y: MAX_INSET * remaining,
    radius: MAX_RADIUS * remaining,
    marks: remaining,
  };
}

/** The glass panel opacity, `(e - 0.7) / 0.3` on the eased grow value: from about 25% to 40%. */
export function panelOpacity(progress: number): number {
  return clamp((growEase(progress) - PANEL_START) / PANEL_SPAN);
}

/** The heading opacity, `clamp(e * 1.6)` on the eased grow value: full from about 30%. */
export function headingOpacity(progress: number): number {
  return clamp(growEase(progress) * HEADING_GAIN);
}
