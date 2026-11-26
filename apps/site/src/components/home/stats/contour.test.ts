import { describe, expect, test } from "bun:test";

import { CELL, traceContours, type ContourPaths, type LabelSlots } from "./contour";

class RecordingPath {
  readonly moves: [number, number][] = [];
  readonly lines: [number, number][] = [];
  moveTo(x: number, y: number): void {
    this.moves.push([x, y]);
  }
  lineTo(x: number, y: number): void {
    this.lines.push([x, y]);
  }
}

function slots(overrides: Partial<LabelSlots> = {}): LabelSlots {
  return { drift: 0, width: 1000, height: 1000, best: new Map(), avoid: [], ...overrides };
}

function trace(
  field: number[],
  size: { cols: number; rows: number },
  labelSlots: LabelSlots | null,
  interval = 1,
): { minor: RecordingPath; major: RecordingPath } {
  const minor = new RecordingPath();
  const major = new RecordingPath();
  const paths: ContourPaths = { minor, major, slots: labelSlots };
  traceContours(Float32Array.from(field), size, interval, paths);
  return { minor, major };
}

function ramp(cols: number, rows: number, valueAt: (x: number, y: number) => number): number[] {
  const field: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) field.push(valueAt(i * CELL, j * CELL));
  }
  return field;
}

describe("traceContours", () => {
  test("draws nothing for a flat field", () => {
    const { minor, major } = trace([0.1, 0.1, 0.1, 0.1], { cols: 2, rows: 2 }, null);
    expect(minor.moves).toHaveLength(0);
    expect(major.moves).toHaveLength(0);
  });

  test("routes a contour to the minor or the major path by its level", () => {
    const minorOnly = trace([1.5, 0.4, 0.4, 0.4], { cols: 2, rows: 2 }, null);
    expect(minorOnly.minor.moves).toHaveLength(1);
    expect(minorOnly.major.moves).toHaveLength(0);
    const indexOnly = trace([5.5, 4.5, 4.5, 4.5], { cols: 2, rows: 2 }, null);
    expect(indexOnly.minor.moves).toHaveLength(0);
    expect(indexOnly.major.moves).toHaveLength(1);
  });

  test("covers every marching squares case", () => {
    const counts: number[] = [];
    for (let mask = 1; mask < 15; mask++) {
      const [a, b, c, d] = [mask & 8, mask & 4, mask & 2, mask & 1].map((bit) => (bit ? 1.5 : 0.5));
      const { minor } = trace([a ?? 0, b ?? 0, d ?? 0, c ?? 0], { cols: 2, rows: 2 }, null);
      counts.push(minor.moves.length);
    }
    expect(counts).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1]);
  });

  test("offers labels on index contours, nearest the slot centre", () => {
    const size = { cols: 80, rows: 60 };
    for (const sign of [1, -1]) {
      const labelSlots = slots({ width: 80 * CELL, height: 60 * CELL });
      trace(
        ramp(size.cols, size.rows, (x, y) => (sign * (y + x * 0.05)) / 40),
        size,
        labelSlots,
      );
      expect(labelSlots.best.size).toBeGreaterThan(1);
      for (const label of labelSlots.best.values()) {
        expect(Math.abs(label.angle)).toBeLessThanOrEqual(Math.PI / 3);
        expect(Math.abs(label.level % 5)).toBe(0);
      }
    }
  });

  test("keeps labels out of the content areas and the margins", () => {
    const size = { cols: 80, rows: 60 };
    const field = ramp(size.cols, size.rows, (x, y) => (y + x * 0.05) / 40);
    const base = { width: 80 * CELL, height: 60 * CELL };
    const covered = slots({ ...base, avoid: [{ x0: -10, y0: -10, x1: 10000, y1: 10000 }] });
    trace(field, size, covered);
    expect(covered.best.size).toBe(0);
    const squeezed = slots({ width: 30, height: 30 });
    trace(field, size, squeezed);
    expect(squeezed.best.size).toBe(0);
  });

  test("skips labels where the contour runs steeper than sixty degrees", () => {
    const size = { cols: 80, rows: 60 };
    const labelSlots = slots({ width: 80 * CELL, height: 60 * CELL });
    trace(
      ramp(size.cols, size.rows, (x, y) => (x + y * 0.05) / 40),
      size,
      labelSlots,
    );
    expect(labelSlots.best.size).toBe(0);
  });
});
