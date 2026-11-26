import { coverGeometry } from "../graphics/painting-fx";
import type { Point, Rect, Size } from "../graphics/painting-fx";

const HOTSPOT_SIZE = 64;
export const BUBBLE_VISIBLE_MS = 3200;
const BUBBLE_WIDTH = 236;
const BUBBLE_LIFT = 86;
const BUBBLE_SHIFT = 110;
const PHRASE_COUNT = 4;

/**
 * Hotspot box over the golem: a 64 px square centred on `golem` (painting
 * units) as drawn by `object-fit: cover` in `box`, kept 32 px inside the sides.
 */
export function golemPlacement(
  image: Size,
  box: Size,
  objectPosition: readonly [number, number],
  golem: Point,
): Rect {
  const { scale, offsetX, offsetY } = coverGeometry(image, box, objectPosition);
  const half = HOTSPOT_SIZE / 2;
  const centreX = Math.min(Math.max(offsetX + golem[0] * scale, half), box.width - half);
  const centreY = offsetY + golem[1] * scale;
  return { x: centreX - half, y: centreY - half, width: HOTSPOT_SIZE, height: HOTSPOT_SIZE };
}

/** Top-left of the speech bubble above `hotspot`, kept inside a host `hostWidth` wide. */
export function bubblePlacement(hotspot: Rect, hostWidth: number): Point {
  const centreX = hotspot.x + hotspot.width / 2;
  return [
    Math.min(centreX - BUBBLE_SHIFT, hostWidth - BUBBLE_WIDTH),
    hotspot.y + hotspot.height / 2 - BUBBLE_LIFT,
  ];
}

/** Index of the phrase after `i` in the four-phrase cycle. */
export function nextPhrase(i: number): number {
  return (i + 1) % PHRASE_COUNT;
}

/** Wiring of the golem hotspot. */
export interface GolemHotspotOptions {
  readonly button: HTMLElement;
  readonly bubble: HTMLElement;
  readonly phrases: readonly string[];
  readonly onClick: () => void;
}

/** Shows the bubble on hover and focus, cycles phrases on click; returns a cleanup. */
export function initGolemHotspot(options: GolemHotspotOptions): () => void {
  const { button, bubble, phrases, onClick } = options;
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (): void => {
    if (bubble.textContent === "") bubble.textContent = phrases[index] ?? "";
    bubble.classList.add("is-on");
  };
  const hide = (): void => {
    bubble.classList.remove("is-on");
  };
  const click = (): void => {
    index = nextPhrase(index);
    bubble.textContent = phrases[index] ?? "";
    show();
    clearTimeout(timer);
    timer = setTimeout(hide, BUBBLE_VISIBLE_MS);
    onClick();
  };
  const events: [string, () => void][] = [
    ["pointerenter", show],
    ["focus", show],
    ["pointerleave", hide],
    ["blur", hide],
    ["click", click],
  ];
  for (const [name, handler] of events) button.addEventListener(name, handler);
  return () => {
    clearTimeout(timer);
    for (const [name, handler] of events) button.removeEventListener(name, handler);
  };
}
