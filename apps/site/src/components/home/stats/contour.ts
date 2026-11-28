/**
 * Marching squares contour tracing and survey-style elevation label
 * placement over a sampled height field.
 * Part of the Topo Background port, see topo.ts for the license.
 */

export const CELL = 12;
const INDEX_EVERY = 5;
const LABEL_SPACING = 210;
export const LABEL_BASE = 500;
export const LABEL_STEP = 20;

const LABEL_MARGIN = 0.16;
const LABEL_EDGE = 24;
const MAX_LABEL_ANGLE = Math.PI / 3;

interface SegmentPath {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}

export interface AvoidArea {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Label {
  x: number;
  y: number;
  angle: number;
  level: number;
  score: number;
}

export interface LabelSlots {
  drift: number;
  width: number;
  height: number;
  best: Map<number, Label>;
  avoid: AvoidArea[];
}

export interface ContourPaths {
  minor: SegmentPath;
  major: SegmentPath;
  slots: LabelSlots | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Crossings {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The segment a contour draws through one grid cell (bits: TL 8, TR 4, BR 2, BL 1). */
function cellSegments(path: SegmentPath, index: number, box: Box, cross: Crossings): void {
  const { x0, y0, x1, y1 } = box;
  const { top, right, bottom, left } = cross;
  const line = (ax: number, ay: number, bx: number, by: number): void => {
    path.moveTo(ax, ay);
    path.lineTo(bx, by);
  };
  switch (index) {
    case 1:
    case 14:
      line(x0, left, bottom, y1);
      break;
    case 2:
    case 13:
      line(bottom, y1, x1, right);
      break;
    case 3:
    case 12:
      line(x0, left, x1, right);
      break;
    case 4:
    case 11:
      line(top, y0, x1, right);
      break;
    case 6:
    case 9:
      line(top, y0, bottom, y1);
      break;
    case 7:
    case 8:
      line(x0, left, top, y0);
      break;
    case 5:
      line(x0, left, top, y0);
      line(bottom, y1, x1, right);
      break;
    case 10:
      line(top, y0, x1, right);
      line(x0, left, bottom, y1);
      break;
  }
}

/** Keeps the label closest to the centre of its staggered slot, away from content and edges. */
function offerLabel(slots: LabelSlots, label: Omit<Label, "score">): void {
  const { x, y } = label;
  if (
    y < slots.height * LABEL_MARGIN ||
    y > slots.height * (1 - LABEL_MARGIN) ||
    x < LABEL_EDGE ||
    x > slots.width - LABEL_EDGE
  ) {
    return;
  }
  for (const area of slots.avoid) {
    if (x > area.x0 && x < area.x1 && y > area.y0 && y < area.y1) return;
  }
  const row = Math.floor(y / LABEL_SPACING);
  const shifted = x + slots.drift + (row % 2) * (LABEL_SPACING / 2);
  const col = Math.floor(shifted / LABEL_SPACING);
  const cx = (col + 0.5) * LABEL_SPACING;
  const cy = (row + 0.5) * LABEL_SPACING;
  const score = (shifted - cx) ** 2 + (y - cy) ** 2;
  if (score > (LABEL_SPACING * 0.32) ** 2) return;
  const key = row * 100000 + col;
  const current = slots.best.get(key);
  if (!current || score < current.score) slots.best.set(key, { ...label, score });
}

function offerCellLabel(
  slots: LabelSlots,
  corners: readonly [number, number, number, number],
  origin: { x: number; y: number },
  level: number,
  threshold: number,
): void {
  const [a, b, c, d] = corners;
  const gx = b - a + c - d;
  const gy = d - a + c - b;
  const px = gx / (2 * CELL);
  const py = gy / (2 * CELL);
  const g2 = px * px + py * py;
  const lift = g2 > 0 ? (threshold - (a + b + c + d) / 4) / g2 : 0;
  const half = CELL / 2;
  const ox = Math.max(-half, Math.min(half, lift * px));
  const oy = Math.max(-half, Math.min(half, lift * py));
  let angle = Math.atan2(gx, -gy);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  if (Math.abs(angle) > MAX_LABEL_ANGLE) return;
  offerLabel(slots, { x: origin.x + half + ox, y: origin.y + half + oy, angle, level });
}

function traceCell(
  field: Float32Array,
  cols: number,
  cell: { i: number; j: number },
  interval: number,
  paths: ContourPaths,
): void {
  const { i, j } = cell;
  const a = field[j * cols + i] ?? 0;
  const b = field[j * cols + i + 1] ?? 0;
  const c = field[(j + 1) * cols + i + 1] ?? 0;
  const d = field[(j + 1) * cols + i] ?? 0;
  const x0 = i * CELL;
  const y0 = j * CELL;
  const first = Math.ceil(Math.min(a, b, c, d) / interval);
  const last = Math.floor(Math.max(a, b, c, d) / interval);
  if (first > last) return;
  const box = { x0, y0, x1: x0 + CELL, y1: y0 + CELL };
  for (let level = first; level <= last; level++) {
    const t = level * interval;
    const index = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
    if (index === 0 || index === 15) continue;
    const isIndex = level % INDEX_EVERY === 0;
    cellSegments(isIndex ? paths.major : paths.minor, index, box, {
      top: x0 + CELL * ((t - a) / (b - a)),
      right: y0 + CELL * ((t - b) / (c - b)),
      bottom: x0 + CELL * ((t - d) / (c - d)),
      left: y0 + CELL * ((t - a) / (d - a)),
    });
    if (isIndex && paths.slots && index !== 5 && index !== 10) {
      offerCellLabel(paths.slots, [a, b, c, d], { x: x0, y: y0 }, level, t);
    }
  }
}

/** Traces every contour of the field into the minor and major paths, offering index labels. */
export function traceContours(
  field: Float32Array,
  size: { cols: number; rows: number },
  interval: number,
  paths: ContourPaths,
): void {
  for (let j = 0; j < size.rows - 1; j++) {
    for (let i = 0; i < size.cols - 1; i++) traceCell(field, size.cols, { i, j }, interval, paths);
  }
}
