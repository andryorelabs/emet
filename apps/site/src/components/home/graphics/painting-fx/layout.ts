import type { Point, Rect, Size } from "./types";

/** Placement of a painting drawn with `object-fit: cover` inside its host. */
export interface CoverGeometry {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const EYE_PAD_X = 24;
const EYE_PAD_TOP = 22;
const EYE_PAD_BOTTOM = 24;
const CLOUD_PERIOD_MS = 70000;
const CLOUD_SWING = 0.026;
const CLOUD_STRETCH = 1.05;

/** Painting-space box around both eyes that the eyes shader redraws. */
export function eyeRegion(eyes: readonly [Point, Point], eyeScale: number): Rect {
  const left = Math.min(eyes[0][0], eyes[1][0]) - EYE_PAD_X * eyeScale;
  const right = Math.max(eyes[0][0], eyes[1][0]) + EYE_PAD_X * eyeScale;
  const top = Math.min(eyes[0][1], eyes[1][1]) - EYE_PAD_TOP * eyeScale;
  const bottom = Math.max(eyes[0][1], eyes[1][1]) + EYE_PAD_BOTTOM * eyeScale;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Host-pixel box of a painting-space rectangle. */
export function placeRect(region: Rect, geometry: CoverGeometry): Rect {
  return {
    x: geometry.offsetX + region.x * geometry.scale,
    y: geometry.offsetY + region.y * geometry.scale,
    width: region.width * geometry.scale,
    height: region.height * geometry.scale,
  };
}

/** Vertical mask that keeps the sky copy opaque down to `skyMask[0]` and fades it out by `skyMask[1]`. */
export function skyMaskGradient(
  image: Size,
  geometry: CoverGeometry,
  skyMask: readonly [number, number],
): string {
  const solid = geometry.offsetY + image.height * geometry.scale * skyMask[0];
  const clear = geometry.offsetY + image.height * geometry.scale * skyMask[1];
  return `linear-gradient(180deg,#000 0,#000 ${solid}px,transparent ${clear}px)`;
}

/** CSS transform of the sky copy at `nowMs`: a slow sine drift of the host width, slightly stretched. */
export function cloudTransform(nowMs: number, hostWidth: number): string {
  const drift = Math.sin((nowMs / CLOUD_PERIOD_MS) * Math.PI * 2) * hostWidth * CLOUD_SWING;
  return `translateX(${drift.toFixed(2)}px) scaleX(${CLOUD_STRETCH})`;
}

/** Canvas backing size in device pixels for a painting-space rectangle; never below 2. */
export function canvasSize(region: Rect, pixelScale: number): Size {
  return {
    width: Math.max(2, Math.round(region.width * pixelScale)),
    height: Math.max(2, Math.round(region.height * pixelScale)),
  };
}
