import { coverGeometry, fxEnabled, paintingFx, VALLEY_PAINTING } from "../graphics/painting-fx";
import type { Point, PaintingFxHandle } from "../graphics/painting-fx";
import { applyCursorLight, easePoint } from "./cursor-light";
import {
  clampHomes,
  createFireflies,
  drawFireflies,
  FIREFLY_COUNT,
  stepFirefly,
} from "./fireflies";
import type { Firefly } from "./fireflies";
import {
  BLINK_POINT,
  bubblePlacement,
  golemPlacement,
  initGolemHotspot,
  isNearPoint,
  RING_POINT,
  ringPlacement,
  spawnRing,
} from "./golem-hotspot";

const GOLEM_POINT: Point = [1385, 690];
const HERO_OBJECT_POSITION: readonly [number, number] = [0.5, 0.62];
const MAX_PIXEL_RATIO = 2;
const MAX_STEP_MS = 40;

/** Facts that decide whether the hero effects run. */
export interface HeroFxEnv {
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
}

/** True for motion-tolerant, wide, fine-pointer viewers; the painting layer adds its own WebGL check. */
export function heroFxEnabled(env: HeroFxEnv): boolean {
  return fxEnabled({ ...env, webgl: true });
}

/** Reads the phrase list the markup carries in `data-phrases`; an invalid list is empty. */
export function readPhrases(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Smoothed pointer position over the hero and whether the pointer is inside it. */
interface PointerState {
  target: Point;
  eased: Point;
  inside: boolean;
}

/** Gaze target for the painted eyes: the eased pointer while it is over the hero, else none. */
export function gazeOf(pointer: PointerState): { x: number; y: number } | null {
  return pointer.inside ? { x: pointer.eased[0], y: pointer.eased[1] } : null;
}

function readEnv(): HeroFxEnv {
  return {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
  };
}

function place(element: HTMLElement, x: number, y: number, size?: number): void {
  element.style.setProperty("left", `${x}px`);
  element.style.setProperty("top", `${y}px`);
  if (size !== undefined) {
    element.style.setProperty("width", `${size}px`);
    element.style.setProperty("height", `${size}px`);
  }
}

/**
 * Starts the hero effects inside `root` (the hero section): fireflies that
 * avoid the cursor, a soft cursor light, the golem hotspot and `paintingFx`
 * (clouds, river, eyes following the cursor and blinking when it nears the
 * golem). Nothing starts for reduced motion or coarse pointers; the loop pauses off screen and on
 * a hidden tab. `startPainting` is injectable for tests. Rays and grain are plain CSS and need no script.
 */
export function initHeroFx(
  root: HTMLElement,
  startPainting: typeof paintingFx = paintingFx,
): { destroy(): void } {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-hero-fireflies]");
  const light = root.querySelector<HTMLElement>("[data-hero-light]");
  const button = root.querySelector<HTMLElement>("[data-hero-golem]");
  const bubble = root.querySelector<HTMLElement>("[data-hero-bubble]");
  const context = canvas?.getContext("2d") ?? null;
  if (!heroFxEnabled(readEnv()) || !canvas || !light || !button || !bubble || !context) {
    return { destroy: () => undefined };
  }
  const drawing = context;
  const elements = { canvas, light, button, bubble };

  let flies: Firefly[] = [];
  const pointer: PointerState = { target: [0, 0], eased: [0, 0], inside: false };
  let visible = false;
  let frame = 0;
  let lastTime = 0;
  let nearGolem = false;
  let geometry = coverGeometry(VALLEY_PAINTING.size, size(), HERO_OBJECT_POSITION);

  function size(): { width: number; height: number } {
    return { width: root.clientWidth, height: root.clientHeight };
  }

  function layout(): void {
    const box = size();
    const ratio = Math.min(MAX_PIXEL_RATIO, globalThis.devicePixelRatio || 1);
    elements.canvas.setAttribute("width", String(Math.round(box.width * ratio)));
    elements.canvas.setAttribute("height", String(Math.round(box.height * ratio)));
    drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
    flies =
      flies.length === 0
        ? createFireflies(FIREFLY_COUNT, box, Math.random)
        : clampHomes(flies, box);
    geometry = coverGeometry(VALLEY_PAINTING.size, box, HERO_OBJECT_POSITION);
    const spot = golemPlacement(VALLEY_PAINTING.size, box, HERO_OBJECT_POSITION, GOLEM_POINT);
    const bubbleAt = bubblePlacement(spot, box.width);
    place(elements.button, spot.x, spot.y, spot.width);
    place(elements.bubble, bubbleAt[0], bubbleAt[1]);
  }

  function tick(now: number): void {
    frame = 0;
    const dt = Math.min(MAX_STEP_MS, now - lastTime);
    lastTime = now;
    if (!pointer.inside) pointer.target = [root.clientWidth * 0.5, root.clientHeight * 0.6];
    pointer.eased = easePoint(pointer.eased, pointer.target);
    const near = pointer.inside && isNearPoint(pointer.target, BLINK_POINT, geometry);
    if (near && !nearGolem) painting.blink();
    nearGolem = near;
    applyCursorLight(elements.light, pointer.eased, pointer.inside);
    drawing.clearRect(0, 0, root.clientWidth, root.clientHeight);
    flies = flies.map((fly) => stepFirefly(fly, pointer.inside ? pointer.eased : null, dt, now));
    drawFireflies(drawing, flies, now);
    frame = requestAnimationFrame(tick);
  }

  function sync(): void {
    const allowed = heroFxEnabled(readEnv());
    if (!allowed) drawing.clearRect(0, 0, root.clientWidth, root.clientHeight);
    const running = allowed && visible && !document.hidden;
    if (running && frame === 0) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!running && frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerType === "touch") return;
    const rect = root.getBoundingClientRect();
    pointer.target = [event.clientX - rect.left, event.clientY - rect.top];
    if (!pointer.inside) pointer.eased = pointer.target;
    pointer.inside = true;
  }

  function onResize(): void {
    layout();
    sync();
  }

  function onLeave(): void {
    pointer.inside = false;
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.at(-1)?.isIntersecting ?? false;
    sync();
  });

  layout();
  canvas.hidden = false;
  light.hidden = false;
  button.hidden = false;
  const painting: PaintingFxHandle = startPainting(root, {
    painting: VALLEY_PAINTING,
    effects: { clouds: true, water: true, eyes: true },
    objectPosition: HERO_OBJECT_POSITION,
    gaze: gazeOf.bind(null, pointer),
  });
  const stopHotspot = initGolemHotspot({
    button,
    bubble,
    phrases: readPhrases(root.dataset.phrases),
    onClick: () => {
      painting.glow();
      const box = ringPlacement(VALLEY_PAINTING.size, size(), HERO_OBJECT_POSITION, RING_POINT);
      spawnRing(root, box);
    },
  });
  observer.observe(root);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", sync);
  addEventListener("resize", onResize, { passive: true });

  return {
    destroy() {
      observer.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", sync);
      removeEventListener("resize", onResize);
      stopHotspot();
      painting.destroy();
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      canvas.hidden = true;
      light.hidden = true;
      button.hidden = true;
    },
  };
}
