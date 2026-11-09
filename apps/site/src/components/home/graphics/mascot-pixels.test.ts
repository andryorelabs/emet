import { describe, expect, test } from "bun:test";

import { MASCOT_FRAMES } from "./mascot-frames.generated";
import { framePixelRuns, runsBounds } from "./mascot-pixels";

const UPPER_HALF_BLOCK = 0x2580;
const LOWER_HALF_BLOCK = 0x2584;
const SPACE = 0x20;

function encode(cells: readonly (readonly [number, number, number])[]): string {
  const bytes = new Uint8Array(cells.length * 12);
  const view = new DataView(bytes.buffer);
  for (const [index, cell] of cells.entries()) {
    for (const [offset, value] of cell.entries()) {
      view.setUint32(index * 12 + offset * 4, value, true);
    }
  }
  return btoa(String.fromCharCode(...bytes));
}

describe("framePixelRuns", () => {
  test("stacks the foreground over the background of an upper half block", () => {
    const cells = encode([[UPPER_HALF_BLOCK, 0xff0000, 0x0000ff]]);
    expect(framePixelRuns(cells, 1, 1)).toEqual([
      { x: 0, y: 0, width: 1, color: "#ff0000" },
      { x: 0, y: 1, width: 1, color: "#0000ff" },
    ]);
  });

  test("paints a lower half block on the bottom pixel only", () => {
    const cells = encode([[LOWER_HALF_BLOCK, 0x00ff00, 0]]);
    expect(framePixelRuns(cells, 1, 1)).toEqual([{ x: 0, y: 1, width: 1, color: "#00ff00" }]);
  });

  test("merges neighbours of one colour and splits at gaps", () => {
    const cells = encode([
      [UPPER_HALF_BLOCK, 0x112233, 0],
      [UPPER_HALF_BLOCK, 0x112233, 0],
      [SPACE, 0, 0],
      [UPPER_HALF_BLOCK, 0x112233, 0],
    ]);
    expect(framePixelRuns(cells, 4, 1)).toEqual([
      { x: 0, y: 0, width: 2, color: "#112233" },
      { x: 3, y: 0, width: 1, color: "#112233" },
    ]);
  });
});

describe("runsBounds", () => {
  test("wraps the painted pixels of every run", () => {
    expect(
      runsBounds([
        { x: 3, y: 1, width: 2, color: "#000000" },
        { x: 6, y: 4, width: 3, color: "#000000" },
      ]),
    ).toEqual({ x: 3, y: 1, width: 6, height: 4 });
  });

  test("is undefined when nothing is painted", () => {
    expect(runsBounds([])).toBeUndefined();
  });
});

describe("committed mascot frames", () => {
  test("every frame decodes to runs inside the sprite grid", () => {
    for (const set of Object.values(MASCOT_FRAMES)) {
      expect(set.frames.length).toBeGreaterThan(0);
      for (const frame of set.frames) {
        const runs = framePixelRuns(frame.cells, set.columns, set.rows);
        expect(runs.length).toBeGreaterThan(0);
        for (const run of runs) {
          expect(run.x + run.width).toBeLessThanOrEqual(set.columns);
          expect(run.y).toBeLessThan(set.rows * 2);
          expect(run.color).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });
});
