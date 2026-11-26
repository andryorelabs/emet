import type { Point } from "./types";

/** Gaze offset of both eyes, in painting units. */
export type EyeTargets = readonly [Point, Point];

/** Mutable animation state of one pair of eyes. */
export interface EyeState {
  offsets: [[number, number], [number, number]];
  nextBlinkAt: number | null;
  blinkStartAt: number;
  pendingBlinkAt: number | null;
  glowAt: number;
  random: () => number;
}

/** What the eyes shader draws for one frame. */
export interface EyeFrame {
  readonly offsets: EyeTargets;
  readonly lid: number;
  readonly glow: number;
}

export const GAZE_MAX_UNITS = 3;
export const GAZE_FULL_DISTANCE = 90;
export const BLINK_MS = 160;
export const GLOW_DECAY_MS = 900;
const GAZE_EASE = 0.25;
const FIRST_BLINK_MS = 3000;
const BLINK_MIN_GAP_MS = 3500;
const BLINK_GAP_SPREAD_MS = 3500;
const LID_CLOSED_DEPTH = 0.88;
const NEVER = -1e9;

/** Fresh eye state; `random` is injectable for deterministic blink gaps. */
export function createEyeState(random: () => number = Math.random): EyeState {
  return {
    offsets: [
      [0, 0],
      [0, 0],
    ],
    nextBlinkAt: null,
    blinkStartAt: NEVER,
    pendingBlinkAt: null,
    glowAt: NEVER,
    random,
  };
}

/** Asks for a blink on the next step. */
export function blink(state: EyeState, nowMs: number): void {
  state.pendingBlinkAt = nowMs;
}

/** Lights the eyes at `nowMs`; the glow fades over 900 ms. */
export function glow(state: EyeState, nowMs: number): void {
  state.glowAt = nowMs;
}

/**
 * Gaze offsets toward `gaze` (container pixels) for eyes drawn at `eyes`
 * (painting units): up to 3 units times `eyeScale`, full at 90 px away.
 */
export function gazeTargets(
  eyes: readonly [Point, Point],
  gaze: Point | null,
  geometry: { scale: number; offsetX: number; offsetY: number },
  eyeScale: number,
): EyeTargets {
  const toTarget = (eye: Point): Point => {
    if (!gaze) return [0, 0];
    const dx = gaze[0] - (geometry.offsetX + eye[0] * geometry.scale);
    const dy = gaze[1] - (geometry.offsetY + eye[1] * geometry.scale);
    const distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(distance / GAZE_FULL_DISTANCE, 1) * GAZE_MAX_UNITS * eyeScale;
    return [(dx / distance) * reach, (dy / distance) * reach];
  };
  return [toTarget(eyes[0]), toTarget(eyes[1])];
}

/** Advances the gaze, blink schedule and glow to `nowMs` and returns the frame. */
export function stepEyes(state: EyeState, targets: EyeTargets, nowMs: number): EyeFrame {
  state.nextBlinkAt ??= nowMs + FIRST_BLINK_MS;
  if (nowMs > state.nextBlinkAt) {
    state.blinkStartAt = nowMs;
    state.nextBlinkAt = nowMs + BLINK_MIN_GAP_MS + state.random() * BLINK_GAP_SPREAD_MS;
  }
  if (state.pendingBlinkAt !== null) {
    state.blinkStartAt = nowMs;
    state.pendingBlinkAt = null;
  }
  state.offsets.forEach((offset, i) => {
    const target = targets[i] ?? offset;
    offset[0] += (target[0] - offset[0]) * GAZE_EASE;
    offset[1] += (target[1] - offset[1]) * GAZE_EASE;
  });
  const sinceBlink = nowMs - state.blinkStartAt;
  const blinking = sinceBlink >= 0 && sinceBlink < BLINK_MS;
  const lid = blinking ? 1 - LID_CLOSED_DEPTH * Math.sin((Math.PI * sinceBlink) / BLINK_MS) : 1;
  return {
    offsets: [
      [state.offsets[0][0], state.offsets[0][1]],
      [state.offsets[1][0], state.offsets[1][1]],
    ],
    lid,
    glow: Math.max(0, 1 - (nowMs - state.glowAt) / GLOW_DECAY_MS),
  };
}
