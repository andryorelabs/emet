import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { FRAME_HEIGHT, FRAME_WIDTH, type Frame, type MascotState } from "./brand-pet.ts";
import { buildFramesModule, encodeRasterFrame } from "./brand-frames.ts";

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
