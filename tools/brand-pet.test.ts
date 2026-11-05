import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { captureStateFrames } from "./brand-export.ts";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MANIFEST_LIMITS,
  PET_ROWS,
  SHEET_COLUMNS,
  SHEET_HEIGHT,
  SHEET_ROWS,
  SHEET_WIDTH,
  type PetManifest,
  buildManifest,
  validateManifest,
} from "./brand-pet.ts";

const PET_DIRECTORY = join(import.meta.dir, "..", "docs", "brand", "pet", "emet");
const SHEET_PATH = join(PET_DIRECTORY, "spritesheet.webp");

function isPetManifest(value: unknown): value is PetManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "displayName" in value &&
    "spritesheetPath" in value &&
    "defaultAnimation" in value &&
    "animations" in value
  );
}

function readManifest(): PetManifest {
  const parsed: unknown = JSON.parse(readFileSync(join(PET_DIRECTORY, "pet.json"), "utf8"));
  if (!isPetManifest(parsed)) throw new Error("pet.json is not a pet manifest");
  return parsed;
}

/**
 * True when headless Chromium can launch. CI installs no Playwright browser,
 * so the capture tests run on a developer machine (`bun run brand:export`
 * needs the same browser) and skip elsewhere.
 */
const HAS_CHROMIUM = await chromium
  .launch({ headless: true })
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

async function captureTwice(state: "work" | "waiting") {
  const [first, second] = await Promise.all([captureStateFrames(state), captureStateFrames(state)]);
  expect(first.length).toBeGreaterThan(0);
  expect(second.length).toBe(first.length);
  first.forEach((frame, index) => {
    expect(Buffer.from(frame.png).equals(Buffer.from(second[index]?.png ?? []))).toBe(true);
    expect(frame.durationMs).toBeGreaterThan(0);
  });
}

describe.skipIf(!HAS_CHROMIUM)("captureStateFrames", () => {
  test("captures byte-identical frames on two runs with no network request", async () => {
    await Promise.all([captureTwice("work"), captureTwice("waiting")]);
  }, 60_000);

  test("steps the animated work state through distinct frames", async () => {
    const frames = await captureStateFrames("work");
    const distinct = new Set(frames.map((frame) => Buffer.from(frame.png).toString("base64")));
    expect(distinct.size).toBeGreaterThan(1);
  }, 30_000);

  test("every frame is a 192x208 PNG", async () => {
    const metas = await Promise.all(
      (await captureStateFrames("error")).map(async (frame) => sharp(frame.png).metadata()),
    );
    for (const meta of metas)
      expect([meta.width, meta.height]).toEqual([FRAME_WIDTH, FRAME_HEIGHT]);
  }, 30_000);
});

describe("committed pet bundle", () => {
  test("the sheet is 1536x1872 with an alpha channel", async () => {
    const meta = await sharp(SHEET_PATH).metadata();
    expect([meta.width, meta.height]).toEqual([1536, 1872]);
    expect([SHEET_WIDTH, SHEET_HEIGHT]).toEqual([1536, 1872]);
    expect([SHEET_COLUMNS, SHEET_ROWS]).toEqual([8, 9]);
    expect(meta.format).toBe("webp");
    expect(meta.hasAlpha).toBe(true);
    expect(statSync(SHEET_PATH).size).toBeLessThanOrEqual(MANIFEST_LIMITS.sheetMaxBytes);
  });

  test("the first cell of every row is not empty", async () => {
    const cells = await Promise.all(
      PET_ROWS.map(async (_row, index) =>
        sharp(SHEET_PATH)
          .extract({ left: 0, top: index * FRAME_HEIGHT, width: FRAME_WIDTH, height: FRAME_HEIGHT })
          .ensureAlpha()
          .raw()
          .toBuffer(),
      ),
    );
    for (const cell of cells) {
      expect(cell.some((value, offset) => offset % 4 === 3 && value > 0)).toBe(true);
    }
  });

  test("pet.json meets Orca's manifest limits and rows are in order", () => {
    const manifest = readManifest();
    expect(validateManifest(manifest, statSync(SHEET_PATH).size)).toEqual([]);
    expect(manifest.defaultAnimation).toBe("idle");
    expect(Object.keys(manifest.animations)).toEqual([...PET_ROWS]);
    PET_ROWS.forEach((row, index) => {
      expect(manifest.animations[row]?.row).toBe(index);
      expect(manifest.animations[row]?.frames).toBeLessThanOrEqual(SHEET_COLUMNS);
    });
    expect(manifest.id.length).toBeLessThanOrEqual(128);
    expect(manifest.displayName.length).toBeLessThanOrEqual(120);
    expect(manifest.fps).toBeLessThanOrEqual(60);
  });

  test("animation entries use only Orca's keys and carry one duration per frame", () => {
    const manifest = readManifest();
    for (const animation of Object.values(manifest.animations)) {
      expect(Object.keys(animation).toSorted()).toEqual(["frameDurationsMs", "frames", "row"]);
      expect(animation.frameDurationsMs).toHaveLength(animation.frames);
    }
    const running = manifest.animations.running;
    expect(Math.max(...(running?.frameDurationsMs ?? [Infinity]))).toBeLessThanOrEqual(250);
  });
});

describe("validateManifest", () => {
  const one = [{ png: new Uint8Array(0), durationMs: 125 }];
  const rows = {
    idle: one,
    "running-right": one,
    "running-left": one,
    waving: one,
    jumping: one,
    failed: one,
    waiting: one,
    running: one,
    review: one,
  };
  const valid = buildManifest(rows);

  test("accepts a built manifest", () => {
    expect(validateManifest(valid, 1000)).toEqual([]);
  });

  test("rejects each broken limit", () => {
    expect(validateManifest({ ...valid, id: "x".repeat(129) }, 1)).toHaveLength(1);
    expect(validateManifest({ ...valid, displayName: "x".repeat(121) }, 1)).toHaveLength(1);
    expect(validateManifest({ ...valid, fps: 61 }, 1)).toHaveLength(1);
    expect(
      validateManifest(
        {
          ...valid,
          animations: { ...valid.animations, idle: { row: 0, frames: 2, frameDurationsMs: [100] } },
        },
        1,
      ),
    ).toHaveLength(1);
    expect(
      validateManifest(
        {
          ...valid,
          animations: { ...valid.animations, idle: { row: 0, frames: 1, frameDurationsMs: [0] } },
        },
        1,
      ),
    ).toHaveLength(1);
    expect(validateManifest({ ...valid, spritesheetPath: "../a.webp" }, 1)).toHaveLength(1);
    expect(validateManifest({ ...valid, spritesheetPath: "/a.webp" }, 1)).toHaveLength(1);
    expect(validateManifest(valid, MANIFEST_LIMITS.sheetMaxBytes + 1)).toHaveLength(1);
    const { idle: _idle, ...withoutIdle } = valid.animations;
    expect(validateManifest({ ...valid, animations: withoutIdle }, 1)).toHaveLength(1);
  });
});
