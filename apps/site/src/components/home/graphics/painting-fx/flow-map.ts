import type { Polyline, Rect, Size } from "./types";

const SMOOTH_START = 0.5;

interface Segment {
  readonly ax: number;
  readonly ay: number;
  readonly sx: number;
  readonly sy: number;
  readonly lengthSquared: number;
  readonly widthA: number;
  readonly widthB: number;
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function toSegments(polylines: readonly Polyline[]): Segment[] {
  return polylines.flatMap((line) =>
    line.points.slice(0, -1).map((a, i) => {
      const b = line.points[i + 1] ?? a;
      const sx = b[0] - a[0];
      const sy = b[1] - a[1];
      return {
        ax: a[0],
        ay: a[1],
        sx,
        sy,
        lengthSquared: sx * sx + sy * sy,
        widthA: line.widths[i] ?? 0,
        widthB: line.widths[i + 1] ?? 0,
      };
    }),
  );
}

/**
 * RGBA flow texture for `region` at `size` texels. R and G carry the unit
 * flow direction (0.5 = zero), A the water mask; rows run bottom-up so the
 * array uploads to GL without a flip.
 */
export function buildFlowMap(
  region: Rect,
  polylines: readonly Polyline[],
  size: Size,
): Uint8ClampedArray {
  const { width, height } = size;
  const segments = toSegments(polylines);
  const data = new Uint8ClampedArray(width * height * 4);
  const stepX = region.width / width;
  const stepY = region.height / height;
  for (let row = 0; row < height; row += 1) {
    const py = region.y + region.height - (row + 0.5) * stepY;
    for (let col = 0; col < width; col += 1) {
      const px = region.x + (col + 0.5) * stepX;
      let best = 0;
      let dirX = 0;
      let dirY = 0;
      for (const seg of segments) {
        const along = ((px - seg.ax) * seg.sx + (py - seg.ay) * seg.sy) / seg.lengthSquared;
        const u = Math.max(0, Math.min(1, along));
        const dist = Math.hypot(px - (seg.ax + seg.sx * u), py - (seg.ay + seg.sy * u));
        const halfWidth = seg.widthA + (seg.widthB - seg.widthA) * u;
        const strength =
          dist < halfWidth
            ? 1 - smoothstep((dist - halfWidth * SMOOTH_START) / (halfWidth * SMOOTH_START))
            : 0;
        if (strength > best) {
          best = strength;
          const length = Math.sqrt(seg.lengthSquared);
          dirX = seg.sx / length;
          dirY = seg.sy / length;
        }
      }
      const q = (row * width + col) * 4;
      data[q] = Math.round((dirX * 0.5 + 0.5) * 255);
      data[q + 1] = Math.round((dirY * 0.5 + 0.5) * 255);
      data[q + 3] = Math.round(best * 255);
    }
  }
  return data;
}
