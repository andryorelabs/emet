/**
 * Decodes the mascot's Raster cell frames into SVG rectangles. The Website
 * draws the same pixel art the terminal mod prints: every cell stacks two
 * pixels, so a frame of `columns` x `rows` cells is `columns` x `rows * 2`
 * pixels.
 */

const UPPER_HALF_BLOCK = 0x2580;
const LOWER_HALF_BLOCK = 0x2584;
const CELL_VALUES = 3;
const BYTES_PER_VALUE = 4;

/** A horizontal run of pixels of one colour: `width` pixels from column `x` on pixel row `y`. */
export interface PixelRun {
  x: number;
  y: number;
  width: number;
  color: string;
}

function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function decodeValues(cells: string): number[] {
  const binary = atob(cells);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const values: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += BYTES_PER_VALUE) {
    values.push(view.getUint32(offset, true));
  }
  return values;
}

function pixelGrid(cells: string, columns: number, rows: number): (string | undefined)[][] {
  const values = decodeValues(cells);
  const grid: (string | undefined)[][] = Array.from({ length: rows * 2 }, () =>
    Array.from({ length: columns }, () => undefined),
  );
  for (let cell = 0; cell < columns * rows; cell += 1) {
    const codePoint = values[cell * CELL_VALUES] ?? 0;
    const foreground = values[cell * CELL_VALUES + 1] ?? 0;
    const background = values[cell * CELL_VALUES + 2] ?? 0;
    const row = Math.floor(cell / columns) * 2;
    const column = cell % columns;
    if (codePoint === UPPER_HALF_BLOCK) {
      const top = grid[row];
      const bottom = grid[row + 1];
      if (top) top[column] = toHex(foreground);
      if (bottom && background !== 0) bottom[column] = toHex(background);
    } else if (codePoint === LOWER_HALF_BLOCK) {
      const bottom = grid[row + 1];
      if (bottom) bottom[column] = toHex(foreground);
    }
  }
  return grid;
}

/**
 * Turns one frame into the fewest horizontal runs that paint it.
 * @param cells - The frame's standard base64 of little-endian u32 triplets.
 * @param columns - Cell columns of the frame.
 * @param rows - Cell rows of the frame.
 * @returns The runs, top row first, left to right.
 */
export function framePixelRuns(cells: string, columns: number, rows: number): PixelRun[] {
  const runs: PixelRun[] = [];
  for (const [y, line] of pixelGrid(cells, columns, rows).entries()) {
    let current: PixelRun | undefined;
    for (const [x, color] of line.entries()) {
      if (color === undefined) {
        current = undefined;
      } else if (current?.color === color) {
        current.width += 1;
      } else {
        current = { x, y, width: 1, color };
        runs.push(current);
      }
    }
  }
  return runs;
}

/** The smallest box holding every run: its top-left pixel and its size in pixels. */
export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds the box that tightly wraps the painted pixels of one or more frames,
 * so the sprite can be cropped to its art instead of the whole grid.
 * @param runs - Runs from any number of frames.
 * @returns The tight box, or `undefined` when nothing is painted.
 */
export function runsBounds(runs: readonly PixelRun[]): PixelBounds | undefined {
  let bounds: { left: number; top: number; right: number; bottom: number } | undefined;
  for (const run of runs) {
    const right = run.x + run.width;
    const bottom = run.y + 1;
    bounds = bounds
      ? {
          left: Math.min(bounds.left, run.x),
          top: Math.min(bounds.top, run.y),
          right: Math.max(bounds.right, right),
          bottom: Math.max(bounds.bottom, bottom),
        }
      : { left: run.x, top: run.y, right, bottom };
  }
  return (
    bounds && {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    }
  );
}
