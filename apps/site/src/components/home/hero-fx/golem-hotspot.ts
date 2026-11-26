import { coverGeometry } from "../graphics/painting-fx";
import type { Point, Rect, Size } from "../graphics/painting-fx";

const HOTSPOT_SIZE = 64;
export const BUBBLE_VISIBLE_MS = 3200;
const BUBBLE_WIDTH = 236;
const BUBBLE_LIFT = 86;
const BUBBLE_SHIFT = 110;
const PHRASE_COUNT = 4;
const RING_DURATION_MS = 900;
const RING_SCALE_MAX = 7;
const BLINK_NEAR_RADIUS = 60;
const RING_RADIUS = 10;
const RING_STROKE = 3;
const RING_START_OPACITY = 0.9;

/** Amber of the golem ring, the prototype's `oklch(0.92 0.14 95)`. */
const RING_COLOUR = "oklch(0.92 0.14 95)";

/** Painting point the ring expands from. */
export const RING_POINT: Point = [1366, 690];

/** Painting point whose closeness to the pointer makes the painted eyes blink. */
export const BLINK_POINT: Point = [1369, 672];

/** Host-pixel box of the click ring: a 10-unit radius circle on `point`, as drawn by `object-fit: cover`. */
export function ringPlacement(
  image: Size,
  box: Size,
  objectPosition: readonly [number, number],
  point: Point,
): Rect {
  const { scale, offsetX, offsetY } = coverGeometry(image, box, objectPosition);
  const side = RING_RADIUS * 2 * scale;
  return {
    x: offsetX + point[0] * scale - side / 2,
    y: offsetY + point[1] * scale - side / 2,
    width: side,
    height: side,
  };
}

/** True when `pointer` (host pixels) is within 60 px of the painting `point`. */
export function isNearPoint(
  pointer: Point,
  point: Point,
  geometry: { scale: number; offsetX: number; offsetY: number },
): boolean {
  const x = geometry.offsetX + point[0] * geometry.scale;
  const y = geometry.offsetY + point[1] * geometry.scale;
  return Math.hypot(pointer[0] - x, pointer[1] - y) < BLINK_NEAR_RADIUS;
}

/**
 * Adds an amber ring over `box` in `host` that scales 1 to 7 and fades out in
 * 0.9 s, then removes itself. It animates only transform and opacity, takes no
 * pointer events and does not affect layout.
 */
export function spawnRing(host: HTMLElement, box: Rect): void {
  const ring = host.ownerDocument.createElement("span");
  ring.setAttribute("aria-hidden", "true");
  const styles: [string, string][] = [
    ["position", "absolute"],
    ["left", `${box.x}px`],
    ["top", `${box.y}px`],
    ["width", `${box.width}px`],
    ["height", `${box.height}px`],
    ["box-sizing", "border-box"],
    ["border", `${(RING_STROKE * box.width) / (RING_RADIUS * 2)}px solid ${RING_COLOUR}`],
    ["border-radius", "50%"],
    ["pointer-events", "none"],
    ["opacity", "0"],
  ];
  for (const [name, value] of styles) ring.style.setProperty(name, value);
  host.append(ring);
  const animation = ring.animate(
    [
      { opacity: RING_START_OPACITY, transform: "scale(1)" },
      { opacity: 0, transform: `scale(${RING_SCALE_MAX})` },
    ],
    { duration: RING_DURATION_MS, easing: "ease-out" },
  );
  animation.onfinish = () => {
    ring.remove();
  };
}

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
