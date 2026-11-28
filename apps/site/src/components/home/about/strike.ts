/**
 * Pure scroll maths of the About aleph strike.
 */

const VIEWPORT_ENTRY = 0.9;
const STRIKE_START = 0.25;
const STRIKE_SPAN = 0.3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How much of the strike is drawn for a section whose top sits at `rectTop`
 * in a viewport `viewport` tall: nothing until the section has travelled a
 * quarter of the way up from 90% of the viewport, complete a bit past that.
 */
export function strikeProgress(rectTop: number, viewport: number): number {
  const reach = viewport * VIEWPORT_ENTRY;
  if (reach <= 0) return 1;
  const travelled = clamp01((reach - rectTop) / reach);
  return clamp01((travelled - STRIKE_START) / STRIKE_SPAN);
}
