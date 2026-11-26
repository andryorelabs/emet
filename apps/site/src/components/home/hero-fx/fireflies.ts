import type { Point, Size } from "../graphics/painting-fx";

/** One firefly: its home point, position and velocity in host pixels, and a flicker phase. */
export interface Firefly {
  readonly homeX: number;
  readonly homeY: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly phase: number;
}

export const FIREFLY_AVOID_RADIUS = 80;
export const FIREFLY_COUNT = 15;
const FIREFLY_PUSH = 0.9;
const FIREFLY_SPRING = 0.0006;
const FIREFLY_DRIFT = 0.004;
const FIREFLY_DRAG = 0.95;
const FRAME_MS = 16;
const GLOW_RADIUS = 11;

/** Canvas palette of the glow: a warm amber core fading out. */
const GLOW_CORE = "255, 238, 170";
const GLOW_HALO = "255, 220, 120";

/** Scatters `count` fireflies over the lower part of `size`, resting at their home point. */
export function createFireflies(count: number, size: Size, random: () => number): Firefly[] {
  return Array.from({ length: count }, () => {
    const homeX = size.width * (0.06 + random() * 0.88);
    const homeY = size.height * (0.42 + random() * 0.42);
    return { homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, phase: random() * Math.PI * 2 };
  });
}

/**
 * Advances a firefly by `dtMs`: a slow wobble, a spring back to its home
 * point, and a push away from `pointer` inside 80 px. Pure; returns a new one.
 */
export function stepFirefly(
  firefly: Firefly,
  pointer: Point | null,
  dtMs: number,
  nowMs: number,
): Firefly {
  const frames = dtMs / FRAME_MS;
  let vx =
    firefly.vx +
    Math.sin(nowMs * 0.0007 + firefly.phase) * FIREFLY_DRIFT * frames +
    (firefly.homeX - firefly.x) * FIREFLY_SPRING;
  let vy =
    firefly.vy +
    Math.cos(nowMs * 0.0009 + firefly.phase) * FIREFLY_DRIFT * frames +
    (firefly.homeY - firefly.y) * FIREFLY_SPRING;
  if (pointer) {
    const dx = firefly.x - pointer[0];
    const dy = firefly.y - pointer[1];
    const distance = Math.hypot(dx, dy);
    if (distance < FIREFLY_AVOID_RADIUS && distance > 1) {
      const push = (1 - distance / FIREFLY_AVOID_RADIUS) * FIREFLY_PUSH;
      vx += (dx / distance) * push;
      vy += (dy / distance) * push;
    }
  }
  vx *= FIREFLY_DRAG;
  vy *= FIREFLY_DRAG;
  return { ...firefly, x: firefly.x + vx, y: firefly.y + vy, vx, vy };
}

/** Flicker alpha of a firefly at `nowMs`, between 0.35 and 1. */
export function fireflyAlpha(firefly: Firefly, nowMs: number): number {
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs * 0.003 + firefly.phase));
}

/** Clamps stored homes into a resized host so no firefly rests off screen. */
export function clampHomes(flies: readonly Firefly[], size: Size): Firefly[] {
  return flies.map((fly) => ({
    ...fly,
    homeX: Math.min(fly.homeX, size.width),
    homeY: Math.min(fly.homeY, size.height),
  }));
}

/** The slice of a 2D context that `drawFireflies` uses. */
export interface GlowTarget {
  fillStyle: unknown;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): { addColorStop(offset: number, color: string): void };
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** Draws every firefly as a soft radial glow; the caller clears the canvas first. */
export function drawFireflies(context: GlowTarget, flies: readonly Firefly[], nowMs: number): void {
  for (const fly of flies) {
    const alpha = fireflyAlpha(fly, nowMs);
    const gradient = context.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, GLOW_RADIUS);
    gradient.addColorStop(0, `rgba(${GLOW_CORE}, ${alpha})`);
    gradient.addColorStop(0.35, `rgba(${GLOW_HALO}, ${alpha * 0.35})`);
    gradient.addColorStop(1, `rgba(${GLOW_HALO}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(fly.x - GLOW_RADIUS, fly.y - GLOW_RADIUS, GLOW_RADIUS * 2, GLOW_RADIUS * 2);
  }
}
