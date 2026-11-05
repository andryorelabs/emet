/**
 * Orca pet bundle for `bun run brand:export`: composes the 8 x 9 spritesheet
 * from per-state frames, derives the transform-only rows, builds `pet.json`
 * and checks it against the limits of Orca's `PetManifestSchema`. No browser
 * access here; frames arrive as PNG buffers.
 */

import sharp from "sharp";
import { KB, MB } from "./brand-export-spec.ts";

/** The five mascot states that have source art. */
export type MascotState = "sleep" | "work" | "waiting" | "done" | "error";

/** One captured frame: a PNG of `FRAME_WIDTH` x `FRAME_HEIGHT` and its time on screen. */
export interface Frame {
  png: Uint8Array;
  durationMs: number;
}

/** Orca pet frame size in pixels. */
export const FRAME_WIDTH = 192;
export const FRAME_HEIGHT = 208;

/** Spritesheet grid. */
export const SHEET_COLUMNS = 8;
export const SHEET_ROWS = 9;
export const SHEET_WIDTH = FRAME_WIDTH * SHEET_COLUMNS;
export const SHEET_HEIGHT = FRAME_HEIGHT * SHEET_ROWS;

/** Spritesheet rows, top to bottom. */
export const PET_ROWS = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
] as const;

/** Name of one spritesheet row. */
export type PetRow = (typeof PET_ROWS)[number];

/** Orca manifest limits. */
export const MANIFEST_LIMITS = {
  idMaxLength: 128,
  displayNameMaxLength: 120,
  fpsMax: 60,
  manifestMaxBytes: 64 * KB,
  sheetMaxBytes: 64 * MB,
} as const;

/** One animation entry of `pet.json`. */
export interface PetAnimation {
  row: number;
  frames: number;
  fps: number;
}

/** The `pet.json` document. */
export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
  fps: number;
  frame: { width: number; height: number };
  grid: { columns: number; rows: number };
  defaultAnimation: "idle";
  animations: Record<string, PetAnimation>;
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const TRANSLATE_MARGIN = 32;
const DERIVED_FRAMES = 8;
const JUMP_HEIGHT = 14;
const WAVE_ANGLES = [0, -6, 0, 6, 0, -6, 0, 6];
const RUN_TRAVEL = 10;
const RUN_BOB = 3;
const DERIVED_FRAME_MS = 125;
const MIN_FPS = 1;

/** Moves a frame by whole pixels inside its canvas; the exposed edge stays transparent. */
async function translateFrame(png: Uint8Array, dx: number, dy: number): Promise<Uint8Array> {
  if (Math.abs(dx) > TRANSLATE_MARGIN || Math.abs(dy) > TRANSLATE_MARGIN) {
    throw new Error(`translate (${dx}, ${dy}) exceeds ${TRANSLATE_MARGIN} px`);
  }
  const extended = await sharp(png)
    .extend({
      top: TRANSLATE_MARGIN,
      bottom: TRANSLATE_MARGIN,
      left: TRANSLATE_MARGIN,
      right: TRANSLATE_MARGIN,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
  const moved = await sharp(extended)
    .extract({
      left: TRANSLATE_MARGIN - dx,
      top: TRANSLATE_MARGIN - dy,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    })
    .png()
    .toBuffer();
  return new Uint8Array(moved);
}

/** Rotates a frame around its centre and crops back to the frame size. */
async function rotateFrame(png: Uint8Array, degrees: number): Promise<Uint8Array> {
  if (degrees === 0) return png;
  const rotated = await sharp(png).rotate(degrees, { background: TRANSPARENT }).png().toBuffer();
  const { width, height } = await sharp(rotated).metadata();
  const cropped = await sharp(rotated)
    .extract({
      left: Math.floor((width - FRAME_WIDTH) / 2),
      top: Math.floor((height - FRAME_HEIGHT) / 2),
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    })
    .png()
    .toBuffer();
  return new Uint8Array(cropped);
}

/** Mirrors a frame left to right. */
async function mirrorFrame(png: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(png).flop().png().toBuffer());
}

/** Picks `count` frames spread evenly across `frames`, keeping their total time. */
function sampleFrames(frames: Frame[], count: number): Frame[] {
  if (frames.length <= count) return frames;
  const stride = frames.length / count;
  return Array.from({ length: count }, (_, index) => {
    const frame = frames[Math.floor(index * stride)];
    if (!frame) throw new Error("sampleFrames: frame index out of range");
    return { png: frame.png, durationMs: Math.round(frame.durationMs * stride) };
  });
}

/** Builds the four transform-derived rows from the captured states. */
export async function deriveRows(
  captured: Readonly<Record<MascotState, Frame[]>>,
): Promise<Record<"jumping" | "waving" | "running-left" | "running-right", Frame[]>> {
  const done = captured.done[0];
  const waiting = captured.waiting[0];
  if (!done || !waiting) throw new Error("deriveRows: done and waiting need a frame");
  const steps = Array.from({ length: DERIVED_FRAMES }, (_, index) => index);
  const jumping = await Promise.all(
    steps.map(async (index) => ({
      png: await translateFrame(
        done.png,
        0,
        -Math.round(JUMP_HEIGHT * Math.sin((Math.PI * index) / (DERIVED_FRAMES - 1))),
      ),
      durationMs: DERIVED_FRAME_MS,
    })),
  );
  const waving = await Promise.all(
    steps.map(async (index) => ({
      png: await rotateFrame(waiting.png, WAVE_ANGLES[index] ?? 0),
      durationMs: DERIVED_FRAME_MS,
    })),
  );
  const work = sampleFrames(captured.work, DERIVED_FRAMES);
  const runningRight = await Promise.all(
    steps.map(async (index) => {
      const source = work[index % work.length];
      if (!source) throw new Error("deriveRows: work needs a frame");
      const dx = Math.round(-RUN_TRAVEL + (2 * RUN_TRAVEL * index) / (DERIVED_FRAMES - 1));
      return {
        png: await translateFrame(source.png, dx, -(index % 2) * RUN_BOB),
        durationMs: DERIVED_FRAME_MS,
      };
    }),
  );
  const runningLeft = await Promise.all(
    runningRight.map(async (frame) => ({
      png: await mirrorFrame(frame.png),
      durationMs: frame.durationMs,
    })),
  );
  return {
    jumping,
    waving,
    "running-left": runningLeft,
    "running-right": runningRight,
  };
}

/** Lists the frames of every sheet row, in `PET_ROWS` order. */
export async function buildRows(
  captured: Readonly<Record<MascotState, Frame[]>>,
): Promise<Record<PetRow, Frame[]>> {
  const derived = await deriveRows(captured);
  const rows: Record<PetRow, Frame[]> = {
    idle: sampleFrames(captured.sleep, SHEET_COLUMNS),
    "running-right": derived["running-right"],
    "running-left": derived["running-left"],
    waving: derived.waving,
    jumping: derived.jumping,
    failed: sampleFrames(captured.error, SHEET_COLUMNS),
    waiting: sampleFrames(captured.waiting, SHEET_COLUMNS),
    running: sampleFrames(captured.work, SHEET_COLUMNS),
    review: sampleFrames(captured.done, SHEET_COLUMNS),
  };
  for (const row of PET_ROWS) {
    const count = rows[row].length;
    if (count === 0 || count > SHEET_COLUMNS) {
      throw new Error(`${row}: ${count} frames does not fit ${SHEET_COLUMNS} columns`);
    }
  }
  return rows;
}

/** Composes the transparent lossless WebP spritesheet. */
export async function composeSheet(rows: Readonly<Record<PetRow, Frame[]>>): Promise<Uint8Array> {
  const composites = PET_ROWS.flatMap((row, rowIndex) =>
    rows[row].map((frame, column) => ({
      input: Buffer.from(frame.png),
      left: column * FRAME_WIDTH,
      top: rowIndex * FRAME_HEIGHT,
    })),
  );
  const sheet = await sharp({
    create: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 4, background: TRANSPARENT },
  })
    .composite(composites)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  return new Uint8Array(sheet);
}

/** Builds `pet.json` from the row frames. */
export function buildManifest(rows: Readonly<Record<PetRow, Frame[]>>): PetManifest {
  const animations: Record<string, PetAnimation> = {};
  PET_ROWS.forEach((row, index) => {
    const frames = rows[row];
    const totalMs = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    const fps = Math.max(MIN_FPS, Math.round((1000 * frames.length) / totalMs));
    animations[row] = { row: index, frames: frames.length, fps };
  });
  return {
    id: "emet",
    displayName: "emet",
    description: "The emet mascot, a clay-and-moss golem with a lamp for eyes.",
    spritesheetPath: "spritesheet.webp",
    fps: 8,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    grid: { columns: SHEET_COLUMNS, rows: SHEET_ROWS },
    defaultAnimation: "idle",
    animations,
  };
}

/**
 * Lists every way `manifest` breaks Orca's manifest rules; empty means the
 * folder imports. `sheetBytes` is the size of the spritesheet file.
 */
export function validateManifest(manifest: PetManifest, sheetBytes: number): string[] {
  const problems: string[] = [];
  if (manifest.id.length === 0 || manifest.id.length > MANIFEST_LIMITS.idMaxLength) {
    problems.push(`id must be 1 to ${MANIFEST_LIMITS.idMaxLength} characters`);
  }
  if (
    manifest.displayName.length === 0 ||
    manifest.displayName.length > MANIFEST_LIMITS.displayNameMaxLength
  ) {
    problems.push(`displayName must be 1 to ${MANIFEST_LIMITS.displayNameMaxLength} characters`);
  }
  const fpsValues = [manifest.fps, ...Object.values(manifest.animations).map((a) => a.fps)];
  if (fpsValues.some((fps) => !(fps > 0 && fps <= MANIFEST_LIMITS.fpsMax))) {
    problems.push(`fps must be above 0 and at most ${MANIFEST_LIMITS.fpsMax}`);
  }
  if (manifest.defaultAnimation !== "idle" || !(manifest.defaultAnimation in manifest.animations)) {
    problems.push("defaultAnimation must be idle and exist in animations");
  }
  if (manifest.spritesheetPath.includes("..") || manifest.spritesheetPath.startsWith("/")) {
    problems.push("spritesheetPath must not contain .. or start with /");
  }
  if (
    new TextEncoder().encode(JSON.stringify(manifest)).byteLength > MANIFEST_LIMITS.manifestMaxBytes
  ) {
    problems.push("manifest exceeds 64 KB");
  }
  if (sheetBytes > MANIFEST_LIMITS.sheetMaxBytes) problems.push("spritesheet exceeds 64 MB");
  return problems;
}
