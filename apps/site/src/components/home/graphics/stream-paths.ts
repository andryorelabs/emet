import { VALLEY_PAINTING } from "./painting-fx/painting-data";
import type { PaintingData } from "./painting-fx/types";

type Point = readonly [number, number];

/** Where the three streams meet and the river starts, in master pixels. */
export const WATERFALL: readonly [number, number] = [868, 723];

const RIGHT_JOIN: readonly Point[] = [[880, 721], WATERFALL];
const MIDDLE_JOIN: readonly Point[] = [[940, 680], [923, 697], [903, 710], [880, 721], WATERFALL];

const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Smooths points into a cubic Bezier path (Catmull-Rom with tension 1/6).
 * @param points - Two or more points in master pixels.
 * @returns The `d` attribute of the smoothed path, starting at the first point.
 */
function smoothPath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  const segments = points.slice(0, -1).map((p1, index) => {
    const p2 = points[index + 1] ?? p1;
    const p0 = points[index - 1] ?? p1;
    const p3 = points[index + 2] ?? p2;
    const c1x = round(p1[0] + (p2[0] - p0[0]) / 6);
    const c1y = round(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = round(p2[0] - (p3[0] - p1[0]) / 6);
    const c2y = round(p2[1] - (p3[1] - p1[1]) / 6);
    return `C${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  });
  return [`M${first[0]} ${first[1]}`, ...segments].join(" ");
}

/**
 * Path data for the light drawn over the valley painting's streams.
 * @param painting - The painting whose `river` list holds the left, right, middle and river streams.
 * @returns One `d` string per stream; the three streams end at the waterfall.
 */
export function streamPaths(painting: PaintingData = VALLEY_PAINTING): {
  left: string;
  middle: string;
  right: string;
  river: string;
} {
  const [left, right, middle, river] = painting.river.map((stream) => stream.points);
  return {
    left: smoothPath([...(left ?? []), WATERFALL]),
    middle: smoothPath([...(middle ?? []), ...MIDDLE_JOIN]),
    right: smoothPath([...(right ?? []), ...RIGHT_JOIN]),
    river: smoothPath(river ?? []),
  };
}
