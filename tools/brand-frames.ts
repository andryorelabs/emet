/**
 * Raster frames for the mascot mod: turns the captured mascot PNG frames into
 * half-block `cells` strings and the generated module
 * `mods/emet-mascot/hooks/frames.generated.ts`.
 */

import { join } from "node:path";
import sharp from "sharp";
import { FRAME_HEIGHT, FRAME_WIDTH, type Frame, type MascotState } from "./brand-pet.ts";

export const GENERATED_FRAMES_PATH = join(
  import.meta.dir,
  "..",
  "mods",
  "emet-mascot",
  "hooks",
  "frames.generated.ts",
);

/** Where the Website's copy of the mascot frames lives. */
export const SITE_FRAMES_PATH = join(
  import.meta.dir,
  "..",
  "apps",
  "site",
  "src",
  "components",
  "home",
  "graphics",
  "mascot-frames.generated.ts",
);

/** Mod frame sizes: the pixel edge of the square art and the cell grid it fills. */
export const FRAME_SIZES = {
  small: { pixels: 16, columns: 16, rows: 8 },
  medium: { pixels: 24, columns: 24, rows: 12 },
} as const;

const STATE_ORDER: readonly MascotState[] = ["sleep", "work", "waiting", "done", "error"];
const SIZE_ORDER = ["small", "medium"] as const;
const UPPER_HALF_BLOCK = 0x2580;
const LOWER_HALF_BLOCK = 0x2584;
const SPACE = 0x20;
const OPAQUE_ALPHA = 128;
const BYTES_PER_PIXEL = 4;
const FRAME_ART_HEIGHT = FRAME_WIDTH;
const FRAME_PADDING = (FRAME_HEIGHT - FRAME_ART_HEIGHT) / 2;

/** The only colours a mascot raster cell may use, as `0x00RRGGBB`. */
export const MASCOT_PALETTE: readonly number[] = [
  0xa5a696, 0x51852f, 0x161c17, 0xe7c952, 0xc33d43, 0x057a6d,
];

const FEATURE_COLORS: readonly number[] = [0x161c17, 0xc33d43, 0xe7c952];
const MIN_OPAQUE_COVERAGE = 0.5;
const MIN_FEATURE_COVERAGE = 0.25;

/** A pixel: its colour as `0x00RRGGBB` and whether it is visible. */
interface Pixel {
  color: number;
  opaque: boolean;
}

function readPixel(rgba: Uint8Array, offset: number): Pixel {
  const red = rgba[offset] ?? 0;
  const green = rgba[offset + 1] ?? 0;
  const blue = rgba[offset + 2] ?? 0;
  const alpha = rgba[offset + 3] ?? 0;
  return { color: (red << 16) | (green << 8) | blue, opaque: alpha >= OPAQUE_ALPHA };
}

function toCell(top: Pixel, bottom: Pixel): [number, number, number] {
  if (top.opaque) return [UPPER_HALF_BLOCK, top.color, bottom.opaque ? bottom.color : 0];
  if (bottom.opaque) return [LOWER_HALF_BLOCK, bottom.color, 0];
  return [SPACE, 0, 0];
}

/**
 * Encodes an RGBA image of `columns` x `rows * 2` pixels as Raster cells:
 * standard padded base64 of little-endian u32 triplets
 * `[codePoint, foreground, background]`, colours `0x00RRGGBB`. Each cell
 * stacks two pixels: `▀` with the top pixel as foreground and the bottom as
 * background; a cell with only a bottom pixel is `▄`, and a fully transparent
 * cell is a space. Every code point is a single width-1 character.
 */
export function encodeRasterFrame(rgba: Uint8Array, columns: number, rows: number): string {
  const expected = columns * rows * 2 * BYTES_PER_PIXEL;
  if (rgba.length !== expected) {
    throw new Error(
      `expected ${expected} RGBA bytes for ${columns}x${rows} cells, got ${rgba.length}`,
    );
  }
  const bytes = new Uint8Array(columns * rows * 3 * 4);
  const view = new DataView(bytes.buffer);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const top = readPixel(rgba, (row * 2 * columns + column) * BYTES_PER_PIXEL);
      const bottom = readPixel(rgba, ((row * 2 + 1) * columns + column) * BYTES_PER_PIXEL);
      const offset = (row * columns + column) * 12;
      toCell(top, bottom).forEach((value, index) =>
        view.setUint32(offset + index * 4, value, true),
      );
    }
  }
  return Buffer.from(bytes).toString("base64");
}

function colorDistance(first: number, second: number): number {
  const red = (first >> 16) - (second >> 16);
  const green = ((first >> 8) & 0xff) - ((second >> 8) & 0xff);
  const blue = (first & 0xff) - (second & 0xff);
  return red * red + green * green + blue * blue;
}

function nearestPaletteIndex(color: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  MASCOT_PALETTE.forEach((candidate, index) => {
    const distance = colorDistance(color, candidate);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Picks the palette colour of one target block from its palette-index counts, or `undefined` when transparent. */
function resolveBlock(counts: readonly number[], blockArea: number): number | undefined {
  const opaqueCount = counts.reduce((sum, count) => sum + count, 0);
  if (opaqueCount === 0 || opaqueCount / blockArea < MIN_OPAQUE_COVERAGE) return undefined;
  const feature = FEATURE_COLORS.map((color) => MASCOT_PALETTE.indexOf(color)).find(
    (index) => (counts[index] ?? 0) / opaqueCount >= MIN_FEATURE_COVERAGE,
  );
  if (feature !== undefined) return MASCOT_PALETTE[feature];
  let best = 0;
  counts.forEach((count, index) => {
    if (count > (counts[best] ?? 0)) best = index;
  });
  return MASCOT_PALETTE[best];
}

/**
 * Box-downsamples a square RGBA image to `targetSize` and snaps every pixel to
 * {@link MASCOT_PALETTE}: a block is transparent below 50% opaque coverage,
 * else the first feature colour (`#161c17`, `#c33d43`, `#e7c952`) holding at
 * least 25% of its opaque pixels wins, else the plurality palette colour.
 * Source pixels snap to their nearest palette colour first.
 */
export function downsampleToPalette(
  rgba: Uint8Array,
  sourceSize: number,
  targetSize: number,
): Uint8Array {
  const out = new Uint8Array(targetSize * targetSize * BYTES_PER_PIXEL);
  for (let row = 0; row < targetSize; row++) {
    const yStart = Math.floor((row * sourceSize) / targetSize);
    const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) * sourceSize) / targetSize));
    for (let column = 0; column < targetSize; column++) {
      const xStart = Math.floor((column * sourceSize) / targetSize);
      const xEnd = Math.max(xStart + 1, Math.floor(((column + 1) * sourceSize) / targetSize));
      const counts = MASCOT_PALETTE.map(() => 0);
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const pixel = readPixel(rgba, (y * sourceSize + x) * BYTES_PER_PIXEL);
          if (!pixel.opaque) continue;
          const index = nearestPaletteIndex(pixel.color);
          counts[index] = (counts[index] ?? 0) + 1;
        }
      }
      const color = resolveBlock(counts, (yEnd - yStart) * (xEnd - xStart));
      if (color === undefined) continue;
      const offset = (row * targetSize + column) * BYTES_PER_PIXEL;
      out[offset] = color >> 16;
      out[offset + 1] = (color >> 8) & 0xff;
      out[offset + 2] = color & 0xff;
      out[offset + 3] = 255;
    }
  }
  return out;
}

/** Crops the transparent padding off an Orca frame and palette-snaps the art to a square of `pixels`. */
async function frameToRgba(png: Uint8Array, pixels: number): Promise<Uint8Array> {
  const { data } = await sharp(png)
    .extract({ left: 0, top: FRAME_PADDING, width: FRAME_WIDTH, height: FRAME_ART_HEIGHT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return downsampleToPalette(new Uint8Array(data), FRAME_WIDTH, pixels);
}

type SizeName = (typeof SIZE_ORDER)[number];

/** One encoded animation: the cell grid and its frames as Raster cell strings with their durations. */
export interface EncodedFrameSet {
  columns: number;
  rows: number;
  frames: { cells: string; ms: number }[];
}

type EncodedFrames = Record<MascotState, Record<SizeName, EncodedFrameSet>>;

/** The mascot states the Website shows, at the small frame size. */
const SITE_STATES = ["sleep", "work", "done"] as const;

async function encodeFrameSet(
  frames: readonly Frame[],
  size: (typeof FRAME_SIZES)[SizeName],
): Promise<EncodedFrameSet> {
  const encoded = await Promise.all(
    frames.map(async (frame) => ({
      cells: encodeRasterFrame(await frameToRgba(frame.png, size.pixels), size.columns, size.rows),
      ms: frame.durationMs,
    })),
  );
  return { columns: size.columns, rows: size.rows, frames: encoded };
}

async function encodeState(frames: readonly Frame[]): Promise<Record<SizeName, EncodedFrameSet>> {
  return {
    small: await encodeFrameSet(frames, FRAME_SIZES.small),
    medium: await encodeFrameSet(frames, FRAME_SIZES.medium),
  };
}

async function encodeCaptured(
  captured: Readonly<Record<MascotState, Frame[]>>,
): Promise<EncodedFrames> {
  return {
    sleep: await encodeState(captured.sleep),
    work: await encodeState(captured.work),
    waiting: await encodeState(captured.waiting),
    done: await encodeState(captured.done),
    error: await encodeState(captured.error),
  };
}

function formatModuleFrames(set: EncodedFrameSet, indent: string): string[] {
  const lines: string[] = [];
  for (const frame of set.frames) {
    lines.push(
      `${indent}{`,
      `${indent}  cells:`,
      `${indent}    ${JSON.stringify(frame.cells)},`,
      `${indent}  ms: ${frame.ms},`,
      `${indent}},`,
    );
  }
  return lines;
}

/** Renders the mod's generated module source for every state and size from encoded frames. */
function formatFramesModule(encoded: EncodedFrames): string {
  const lines: string[] = [
    "/** Generated by `bun run brand:export` from `tools/brand-frames.ts`; do not edit. */",
    "",
    'import type { MascotState } from "./state-machine.ts";',
    "",
    "export const FRAMES: Record<",
    "  MascotState,",
    "  Record<",
    '    "small" | "medium",',
    "    { columns: number; rows: number; frames: { cells: string; ms: number }[] }",
    "  >",
    "> = {",
  ];
  for (const state of STATE_ORDER) {
    lines.push(`  ${state}: {`);
    for (const sizeName of SIZE_ORDER) {
      const set = encoded[state][sizeName];
      lines.push(
        `    ${sizeName}: {`,
        `      columns: ${set.columns},`,
        `      rows: ${set.rows},`,
        "      frames: [",
        ...formatModuleFrames(set, "        "),
        "      ],",
        "    },",
      );
    }
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

/**
 * Renders the Website's frames module: the small `sleep`, `work` and `done`
 * frames of the mod, in the same Raster cell format. The Website builds in a
 * context without `mods/`, so it keeps its own copy.
 * @param frames - The mod's frames, as `frames.generated.ts` exports them.
 */
export function formatSiteFramesModule(
  frames: Readonly<Record<MascotState, Readonly<Record<SizeName, EncodedFrameSet>>>>,
): string {
  const lines: string[] = [
    "/** Generated by `bun run brand:export` from `tools/brand-frames.ts`; do not edit. */",
    "",
    "export interface MascotFrameSet {",
    "  columns: number;",
    "  rows: number;",
    "  frames: { cells: string; ms: number }[];",
    "}",
    "",
    'export const MASCOT_FRAMES: Record<"sleep" | "work" | "done", MascotFrameSet> = {',
  ];
  for (const state of SITE_STATES) {
    const set = frames[state].small;
    lines.push(
      `  ${state}: {`,
      `    columns: ${set.columns},`,
      `    rows: ${set.rows},`,
      "    frames: [",
      ...formatModuleFrames(set, "      "),
      "    ],",
      "  },",
    );
  }
  lines.push("};", "");
  return lines.join("\n");
}

/** Renders the generated module source for every state and size from the captured frames. */
export async function buildFramesModule(
  captured: Readonly<Record<MascotState, Frame[]>>,
): Promise<string> {
  return formatFramesModule(await encodeCaptured(captured));
}

/** Renders the Website's frames module from the captured frames. */
export async function buildSiteFramesModule(
  captured: Readonly<Record<MascotState, Frame[]>>,
): Promise<string> {
  return formatSiteFramesModule(await encodeCaptured(captured));
}
