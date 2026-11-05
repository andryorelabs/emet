import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ICO_SIZES,
  KB,
  MARK_MAX_BYTES,
  MARK_SIZES,
  MB,
  OG_TARGETS,
  assertSpec,
  encodeIco,
  readPngSize,
} from "./brand-export-spec.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Builds a minimal byte buffer that carries a PNG signature and an IHDR chunk
 * with the given size, padded to `totalBytes`. Only the header is meaningful.
 */
function fakePng(width: number, height: number, totalBytes = 64): Uint8Array {
  const buffer = new Uint8Array(Math.max(totalBytes, 33));
  buffer.set(PNG_SIGNATURE, 0);
  const view = new DataView(buffer.buffer);
  view.setUint32(8, 13);
  buffer.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buffer;
}

describe("brand export constants", () => {
  test("mark sizes match the kit contract", () => {
    expect([...MARK_SIZES]).toEqual([16, 32, 48, 128, 512]);
  });

  test("ICO sizes are the favicon set", () => {
    expect([...ICO_SIZES]).toEqual([16, 32, 48]);
  });

  test("byte units are binary", () => {
    expect(KB).toBe(1024);
    expect(MB).toBe(1024 * 1024);
  });

  test("OG targets cover both themes of the cover and the social preview", () => {
    expect(OG_TARGETS.map((target) => target.name)).toEqual([
      "cover",
      "cover-light",
      "social-preview",
      "social-preview-light",
    ]);
  });

  test("social previews are 1280x640 and budgeted under 1 MB", () => {
    for (const target of OG_TARGETS.filter((entry) => entry.name.startsWith("social"))) {
      expect(target.spec.width).toBe(1280);
      expect(target.spec.height).toBe(640);
      expect(target.spec.maxBytes).toBeLessThan(MB);
    }
  });
});

describe("readPngSize", () => {
  test("reads width and height from the IHDR chunk", () => {
    expect(readPngSize(fakePng(1280, 640))).toEqual({ width: 1280, height: 640 });
  });

  test("throws on a buffer without a PNG signature", () => {
    expect(() => readPngSize(new Uint8Array(40))).toThrow(/not a PNG/);
  });

  test("throws on a truncated buffer", () => {
    expect(() => readPngSize(fakePng(16, 16).slice(0, 20))).toThrow(/not a PNG/);
  });
});

describe("assertSpec", () => {
  const spec = { width: 32, height: 32, maxBytes: 100 };

  test("passes when size and budget match", () => {
    expect(() => assertSpec("mark-32.png", fakePng(32, 32, 100), spec)).not.toThrow();
  });

  test("throws naming the asset when the width is wrong", () => {
    expect(() => assertSpec("mark-32.png", fakePng(33, 32), spec)).toThrow(
      /mark-32\.png.*33x32.*32x32/,
    );
  });

  test("throws when the height is wrong", () => {
    expect(() => assertSpec("mark-32.png", fakePng(32, 31), spec)).toThrow(/32x31/);
  });

  test("throws when the byte budget is exceeded", () => {
    expect(() => assertSpec("mark-32.png", fakePng(32, 32, 101), spec)).toThrow(
      /mark-32\.png.*101 bytes.*100/,
    );
  });

  test("throws when the buffer is not a PNG", () => {
    expect(() => assertSpec("mark-32.png", new Uint8Array(50), spec)).toThrow(/not a PNG/);
  });
});

describe("encodeIco", () => {
  const images = ICO_SIZES.map((size) => fakePng(size, size, 40 + size));
  const ico = encodeIco(images);
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  test("writes the ICONDIR header with the image count", () => {
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(images.length);
  });

  test("writes one directory entry per image with size, planes, depth and offset", () => {
    let expectedOffset = 6 + 16 * images.length;
    images.forEach((image, index) => {
      const entry = 6 + 16 * index;
      const size = ICO_SIZES[index] ?? 0;
      expect(ico[entry]).toBe(size);
      expect(ico[entry + 1]).toBe(size);
      expect(ico[entry + 2]).toBe(0);
      expect(ico[entry + 3]).toBe(0);
      expect(view.getUint16(entry + 4, true)).toBe(1);
      expect(view.getUint16(entry + 6, true)).toBe(32);
      expect(view.getUint32(entry + 8, true)).toBe(image.byteLength);
      expect(view.getUint32(entry + 12, true)).toBe(expectedOffset);
      expectedOffset += image.byteLength;
    });
    expect(ico.byteLength).toBe(expectedOffset);
  });

  test("embeds each PNG verbatim at its offset", () => {
    images.forEach((image, index) => {
      const offset = view.getUint32(6 + 16 * index + 12, true);
      expect(Array.from(ico.slice(offset, offset + image.byteLength))).toEqual(Array.from(image));
    });
  });

  test("encodes a 256 px image as 0 in the directory entry", () => {
    const large = encodeIco([fakePng(256, 256)]);
    expect(large[6]).toBe(0);
    expect(large[7]).toBe(0);
  });

  test("throws when given no images", () => {
    expect(() => encodeIco([])).toThrow(/at least one/);
  });

  test("throws when an image is larger than 256 px", () => {
    expect(() => encodeIco([fakePng(512, 512)])).toThrow(/256/);
  });

  test("throws when an image is not a PNG", () => {
    expect(() => encodeIco([new Uint8Array(40)])).toThrow(/not a PNG/);
  });
});

describe("committed rasters", () => {
  const brandDirectory = join(import.meta.dir, "..", "docs", "brand");
  const PNG_COLOUR_TYPE_OFFSET = 25;
  const TRUECOLOUR_ALPHA = 6;
  const TRUECOLOUR = 2;

  function readRaster(relativePath: string): Uint8Array {
    return new Uint8Array(readFileSync(join(brandDirectory, relativePath)));
  }

  test("every mark PNG has its exact size and is truecolour with alpha", () => {
    for (const size of MARK_SIZES) {
      const name = `mark-${size}.png`;
      const png = readRaster(`logo/png/${name}`);
      assertSpec(name, png, { width: size, height: size, maxBytes: MARK_MAX_BYTES });
      expect(png[PNG_COLOUR_TYPE_OFFSET]).toBe(TRUECOLOUR_ALPHA);
    }
  });

  test("every og PNG has its exact size, stays under budget and is not palette based", () => {
    for (const target of OG_TARGETS) {
      const png = readRaster(`og/${target.name}.png`);
      assertSpec(`${target.name}.png`, png, target.spec);
      expect([TRUECOLOUR, TRUECOLOUR_ALPHA].includes(png[PNG_COLOUR_TYPE_OFFSET] ?? -1)).toBe(true);
    }
  });

  test("favicon.ico holds one 32 bpp entry per ICO size", () => {
    const ico = readRaster("logo/png/favicon.ico");
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint16(4, true)).toBe(ICO_SIZES.length);
    ICO_SIZES.forEach((size, index) => {
      const entry = 6 + 16 * index;
      expect(ico[entry]).toBe(size);
      expect(view.getUint16(entry + 6, true)).toBe(32);
      const offset = view.getUint32(entry + 12, true);
      expect(ico[offset + PNG_COLOUR_TYPE_OFFSET]).toBe(TRUECOLOUR_ALPHA);
    });
  });
});

function colours(svg: string): string[] {
  return [...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase());
}

describe("mascot states", () => {
  const brandDirectory = join(import.meta.dir, "..", "docs", "brand");
  const mascotDirectory = join(brandDirectory, "mascot");
  const palette = new Set([
    "#a5a696",
    "#51852f",
    "#161c17",
    "#e7c952",
    "#057a6d",
    "#c33d43",
    "#f4fdf6",
  ]);

  test("every mascot SVG uses only palette colours and the 32-unit viewBox (except the 16 px one)", () => {
    const files = readdirSync(mascotDirectory).filter((name) => /^mascot-.*\.svg$/.test(name));
    expect(files).toContain("mascot-waiting.svg");
    for (const file of files) {
      const svg = readFileSync(join(mascotDirectory, file), "utf8");
      if (file !== "mascot-16.svg") expect(svg).toContain('viewBox="0 0 32 32"');
      for (const colour of colours(svg)) expect(palette.has(colour)).toBe(true);
    }
  });

  test("waiting uses the four core palette colours only", () => {
    const svg = readFileSync(join(mascotDirectory, "mascot-waiting.svg"), "utf8");
    expect([...new Set(colours(svg))].toSorted()).toEqual([
      "#161c17",
      "#51852f",
      "#a5a696",
      "#e7c952",
    ]);
  });

  test("the brand README and the brandbook mention the waiting state", () => {
    expect(readFileSync(join(brandDirectory, "README.md"), "utf8")).toContain("mascot-waiting.svg");
    expect(readFileSync(join(brandDirectory, "brandbook", "index.html"), "utf8")).toContain(
      "mascot-waiting.svg",
    );
  });
});
