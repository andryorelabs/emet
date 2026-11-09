import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { FRAME_HEIGHT, FRAME_WIDTH, type Frame, type MascotState } from "./brand-pet.ts";
import { FRAMES } from "../mods/emet-mascot/hooks/frames.generated.ts";
import {
  MASCOT_PALETTE,
  SITE_FRAMES_PATH,
  buildFramesModule,
  downsampleToPalette,
  encodeRasterFrame,
  formatSiteFramesModule,
} from "./brand-frames.ts";

function decode(cells: string): number[] {
  const bytes = Buffer.from(cells, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
}

describe("encodeRasterFrame", () => {
  test("encodes a half-block cell as foreground top, background bottom", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(decode(encodeRasterFrame(rgba, 1, 1))).toEqual([0x2580, 0xff0000, 0x0000ff]);
  });

  test("encodes a transparent cell as a space and a bottom-only cell as a lower block", () => {
    const rgba = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 255]);
    expect(decode(encodeRasterFrame(rgba, 2, 1))).toEqual([0x20, 0, 0, 0x2584, 0x010203, 0]);
  });

  test("rejects a buffer of the wrong size", () => {
    expect(() => encodeRasterFrame(new Uint8Array(3), 1, 1)).toThrow();
  });
});

function block(colors: readonly (number | undefined)[]): Uint8Array {
  const rgba = new Uint8Array(colors.length * 4);
  colors.forEach((color, index) => {
    if (color === undefined) return;
    rgba.set([color >> 16, (color >> 8) & 0xff, color & 0xff, 255], index * 4);
  });
  return rgba;
}

function colorOf(rgba: Uint8Array): number | undefined {
  if (rgba[3] === 0) return undefined;
  return ((rgba[0] ?? 0) << 16) | ((rgba[1] ?? 0) << 8) | (rgba[2] ?? 0);
}

const GRAY = 0xa5a696;
const GREEN = 0x51852f;
const INK = 0x161c17;

describe("downsampleToPalette", () => {
  test("is transparent below 50% opaque coverage and opaque at or above it", () => {
    expect(colorOf(downsampleToPalette(block([GRAY, undefined, undefined, undefined]), 2, 1))).toBe(
      undefined,
    );
    expect(colorOf(downsampleToPalette(block([GRAY, GRAY, undefined, undefined]), 2, 1))).toBe(
      GRAY,
    );
  });

  test("a feature colour wins at 25% of the opaque pixels", () => {
    expect(colorOf(downsampleToPalette(block([INK, GREEN, GREEN, GREEN]), 2, 1))).toBe(INK);
    expect(
      colorOf(
        downsampleToPalette(
          block([INK, INK, GREEN, GREEN, GREEN, GREEN, GREEN, GREEN, GREEN]),
          3,
          1,
        ),
      ),
    ).toBe(GREEN);
  });

  test("otherwise the plurality palette colour wins", () => {
    expect(
      colorOf(
        downsampleToPalette(
          block([GRAY, GRAY, GRAY, GREEN, GREEN, GREEN, GREEN, undefined, undefined]),
          3,
          1,
        ),
      ),
    ).toBe(GREEN);
  });

  test("snaps off-palette source pixels to the nearest palette colour", () => {
    expect(colorOf(downsampleToPalette(block([0x52862e]), 1, 1))).toBe(GREEN);
  });
});

describe("buildFramesModule", () => {
  test("is deterministic and decodes to columns * rows width-1 triplets", async () => {
    const png = new Uint8Array(
      await sharp({
        create: {
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          channels: 4,
          background: { r: 10, g: 200, b: 30, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
    const frames: Frame[] = [{ png, durationMs: 250 }];
    const captured: Record<MascotState, Frame[]> = {
      sleep: frames,
      work: frames,
      waiting: frames,
      done: frames,
      error: frames,
    };
    const first = await buildFramesModule(captured);
    expect(await buildFramesModule(captured)).toBe(first);
    const cellStrings = [...first.matchAll(/cells:\s+"([^"]+)"/g)].map((match) => match[1] ?? "");
    const sizes = [...first.matchAll(/columns: (\d+),\n\s+rows: (\d+),/g)];
    expect(cellStrings.length).toBe(10);
    expect(sizes.length).toBe(10);
    sizes.forEach((match, index) => {
      const triplets = decode(cellStrings[index] ?? "");
      const cellCount = Number(match[1]) * Number(match[2]);
      expect(triplets.length).toBe(cellCount * 3);
      for (let cell = 0; cell < cellCount; cell++) {
        expect(triplets[cell * 3] ?? 0).toBeOneOf([0x20, 0x2580, 0x2584]);
      }
    });
  });
});

describe("committed frames.generated.ts", () => {
  test("every frame decodes to columns * rows triplets of width-1 half-block cells", () => {
    const allowedCodePoints = new Set([0x20, 0x2580, 0x2584]);
    for (const sizes of Object.values(FRAMES)) {
      for (const size of Object.values(sizes)) {
        for (const frame of size.frames) {
          const values = decode(frame.cells);
          expect(values.length).toBe(size.columns * size.rows * 3);
          for (let index = 0; index < values.length; index += 3) {
            expect(allowedCodePoints.has(values[index] ?? -1)).toBe(true);
            expect(values[index + 1] ?? 0).toBeLessThanOrEqual(0xffffff);
            expect(values[index + 2] ?? 0).toBeLessThanOrEqual(0xffffff);
          }
        }
      }
    }
  });

  test("every opaque colour is in MASCOT_PALETTE", () => {
    const palette = new Set(MASCOT_PALETTE);
    for (const sizes of Object.values(FRAMES)) {
      for (const size of Object.values(sizes)) {
        for (const frame of size.frames) {
          const values = decode(frame.cells);
          for (let index = 0; index < values.length; index += 3) {
            const codePoint = values[index] ?? 0;
            if (codePoint === 0x20) continue;
            expect(palette.has(values[index + 1] ?? -1)).toBe(true);
            if (codePoint === 0x2580 && values[index + 2] !== 0) {
              expect(palette.has(values[index + 2] ?? -1)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("committed mascot-frames.generated.ts", () => {
  test("is the small sleep, work and done frames of the committed mod frames", () => {
    expect(readFileSync(SITE_FRAMES_PATH, "utf8")).toBe(formatSiteFramesModule(FRAMES));
  });
});
