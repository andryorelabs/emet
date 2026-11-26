/** Width and height in pixels or painting units. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Axis-aligned rectangle in painting units, origin top-left. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A point `[x, y]` in painting units. */
export type Point = readonly [number, number];

/** A river centreline with one half-width per point. */
export interface Polyline {
  readonly points: readonly Point[];
  readonly widths: readonly number[];
}

/** Everything `painting-fx` needs to know about one painting. */
export interface PaintingData {
  readonly size: Size;
  readonly eyes: readonly [Point, Point];
  readonly eyeScale: number;
  readonly objectPosition: readonly [number, number];
  readonly skyMask: readonly [number, number];
  readonly waterRegion: Rect | null;
  readonly river: readonly Polyline[];
}
