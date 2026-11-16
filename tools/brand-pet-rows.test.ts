import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  PET_ROWS,
  SHEET_COLUMNS,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  type Frame,
  type MascotState,
  buildManifest,
  buildRows,
  composeSheet,
  deriveRows,
} from "./brand-pet.ts";

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

const BLOCK = 20;
const BLOCK_ORIGIN = { left: 60, top: 70 };

/**
 * A transparent frame with one opaque square, so translation and mirroring
 * are observable. `offsetX` places the square away from the centre.
 */
async function blockFrame(durationMs: number, offsetX = 0): Promise<Frame> {
  const square = await sharp({
    create: { width: BLOCK, height: BLOCK, channels: 4, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const png = await sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: square, left: BLOCK_ORIGIN.left + offsetX, top: BLOCK_ORIGIN.top }])
    .png()
    .toBuffer();
  return { png: new Uint8Array(png), durationMs };
}

/** Finds the bounding box of the opaque pixels of a frame. */
async function opaqueBounds(png: Uint8Array) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

async function capturedStates(workFrames = 8): Promise<Record<MascotState, Frame[]>> {
  const still = await blockFrame(1000);
  const work = await Promise.all(
    Array.from({ length: workFrames }, async (_, index) => blockFrame(250, index)),
  );
  return { sleep: [still], work, waiting: [still], done: [still], error: [still] };
}

describe("deriveRows", () => {
  test("produces eight 125 ms frames for each derived row", async () => {
    const rows = await deriveRows(await capturedStates());
    for (const row of [rows.jumping, rows.waving, rows["running-left"], rows["running-right"]]) {
      expect(row).toHaveLength(8);
      expect(row.every((frame) => frame.durationMs === 125)).toBe(true);
    }
  });

  test("jumping lifts the sprite and returns it to the ground", async () => {
    const { jumping } = await deriveRows(await capturedStates());
    const tops = await Promise.all(
      jumping.map(async (frame) => (await opaqueBounds(frame.png)).minY),
    );
    expect(tops[0]).toBe(BLOCK_ORIGIN.top);
    expect(tops[7]).toBe(BLOCK_ORIGIN.top);
    expect(Math.min(...tops)).toBe(BLOCK_ORIGIN.top - 14);
  });

  test("waving keeps the first frame unrotated and tilts the others", async () => {
    const states = await capturedStates();
    const { waving } = await deriveRows(states);
    expect(waving[0]?.png).toBe(states.waiting[0]?.png);
    expect(
      Buffer.from(waving[1]?.png ?? []).equals(Buffer.from(states.waiting[0]?.png ?? [])),
    ).toBe(false);
    const meta = await sharp(waving[1]?.png).metadata();
    expect([meta.width, meta.height]).toEqual([FRAME_WIDTH, FRAME_HEIGHT]);
  });

  test("running-left mirrors running-right", async () => {
    const { "running-left": left, "running-right": right } = await deriveRows(
      await capturedStates(),
    );
    const rightBounds = await opaqueBounds(right[0]?.png ?? new Uint8Array());
    const leftBounds = await opaqueBounds(left[0]?.png ?? new Uint8Array());
    expect(leftBounds.minX).toBe(FRAME_WIDTH - 1 - rightBounds.maxX);
    expect(leftBounds.minY).toBe(rightBounds.minY);
  });

  test("running-right travels from left to right", async () => {
    const { "running-right": right } = await deriveRows(await capturedStates(1));
    const first = await opaqueBounds(right[0]?.png ?? new Uint8Array());
    const last = await opaqueBounds(right[7]?.png ?? new Uint8Array());
    expect(last.minX - first.minX).toBe(20);
  });

  test("samples a long work capture down to eight frames", async () => {
    const rows = await deriveRows(await capturedStates(16));
    expect(rows["running-right"]).toHaveLength(8);
  });

  test("throws when done or waiting has no frame", async () => {
    const states = await capturedStates();
    expect(await rejection(deriveRows({ ...states, done: [] }))).toMatch(
      /done and waiting need a frame/,
    );
    expect(await rejection(deriveRows({ ...states, waiting: [] }))).toMatch(
      /done and waiting need a frame/,
    );
  });

  test("throws when work has no frame", async () => {
    const states = await capturedStates();
    expect(await rejection(deriveRows({ ...states, work: [] }))).not.toBe("resolved");
  });
});

describe("buildRows", () => {
  test("lists every sheet row within the column budget", async () => {
    const rows = await buildRows(await capturedStates());
    expect(Object.keys(rows).toSorted()).toEqual([...PET_ROWS].toSorted());
    for (const row of PET_ROWS) {
      expect(rows[row].length).toBeGreaterThan(0);
      expect(rows[row].length).toBeLessThanOrEqual(SHEET_COLUMNS);
    }
  });

  test("keeps the total time of a sampled row", async () => {
    const rows = await buildRows(await capturedStates(16));
    const total = rows.running.reduce((sum, frame) => sum + frame.durationMs, 0);
    expect(rows.running).toHaveLength(8);
    expect(total).toBe(16 * 250);
  });

  test("rejects a state with no captured frames", async () => {
    const states = await capturedStates();
    expect(await rejection(buildRows({ ...states, sleep: [] }))).toMatch(
      /idle: 0 frames does not fit 8 columns/,
    );
  });
});

describe("composeSheet", () => {
  test("composes a transparent lossless WebP with each frame in its cell", async () => {
    const rows = await buildRows(await capturedStates());
    const sheet = await composeSheet(rows);
    const meta = await sharp(sheet).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
      "webp",
      SHEET_WIDTH,
      SHEET_HEIGHT,
      true,
    ]);
    const { data } = await sharp(sheet)
      .extract({
        left: 0,
        top: FRAME_HEIGHT * PET_ROWS.indexOf("idle"),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centre = ((BLOCK_ORIGIN.top + 5) * FRAME_WIDTH + BLOCK_ORIGIN.left + 5) * 4;
    expect([...data.subarray(centre, centre + 4)]).toEqual([255, 0, 0, 255]);
    expect(data[3]).toBe(0);
  });
});

describe("buildManifest", () => {
  test("records each row index, frame count and durations", async () => {
    const rows = await buildRows(await capturedStates());
    const manifest = buildManifest(rows);
    PET_ROWS.forEach((row, index) => {
      expect(manifest.animations[row]).toEqual({
        row: index,
        frames: rows[row].length,
        frameDurationsMs: rows[row].map((frame) => frame.durationMs),
      });
    });
  });
});
