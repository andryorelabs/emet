/**
 * Pure geometry of the showcase frame while its runway scrolls: the painting
 * grows from an inset card to full bleed, then the glass panel fades in.
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
const PANEL_END = 0.8;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** The frame inset, radius and crop-mark opacity at a runway progress in 0..1. */
export function frameInset(progress: number): FrameInset {
  const remaining = 1 - smoothstep(clamp(progress / GROW_END));
  return {
    x: MAX_INSET * remaining,
    y: MAX_INSET * remaining,
    radius: MAX_RADIUS * remaining,
    marks: remaining,
  };
}

/** The glass panel opacity: 0 before 70% of the runway, 1 from 80%. */
export function panelOpacity(progress: number): number {
  return clamp((progress - PANEL_START) / (PANEL_END - PANEL_START));
}
