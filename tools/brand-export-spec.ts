/**
 * Pure helpers and size contracts for `tools/brand-export.ts`: the PNG sizes
 * and byte budgets of every exported brand asset, a PNG header reader, the
 * spec assertion and an ICO encoder. No file system or browser access here.
 */

/** One kibibyte. */
export const KB = 1024;

/** One mebibyte. */
export const MB = 1024 * KB;

/** Square pixel sizes of `docs/brand/logo/png/mark-<size>.png`. */
export const MARK_SIZES = [16, 32, 48, 128, 512] as const;

/** Square pixel sizes packed into `docs/brand/logo/png/favicon.ico`. */
export const ICO_SIZES = [16, 32, 48] as const;

/** Byte budget for each square mark PNG. */
export const MARK_MAX_BYTES = 64 * KB;

/** Byte budget for the ICO file. */
export const ICO_MAX_BYTES = 64 * KB;

/** Expected pixel size and byte budget of one exported PNG. */
export interface AssetSpec {
  width: number;
  height: number;
  maxBytes: number;
}

/** One HTML source under `docs/brand/og/` and the PNG it renders to. */
export interface OgTarget {
  name: "cover" | "cover-light" | "social-preview" | "social-preview-light";
  spec: AssetSpec;
}

const COVER_SPEC: AssetSpec = { width: 1280, height: 440, maxBytes: MB - 1 };

/** GitHub rejects social preview images of 1 MB or more. */
const SOCIAL_PREVIEW_SPEC: AssetSpec = { width: 1280, height: 640, maxBytes: MB - 1 };

/** The README covers and GitHub social previews, dark first, then light. */
export const OG_TARGETS: readonly OgTarget[] = [
  { name: "cover", spec: COVER_SPEC },
  { name: "cover-light", spec: COVER_SPEC },
  { name: "social-preview", spec: SOCIAL_PREVIEW_SPEC },
  { name: "social-preview-light", spec: SOCIAL_PREVIEW_SPEC },
];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52];
const PNG_HEADER_BYTES = 24;
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const ICO_MAX_DIMENSION = 256;

/**
 * Reads the pixel size from a PNG's IHDR chunk. Throws when the buffer does
 * not start with a PNG signature followed by IHDR.
 */
export function readPngSize(buffer: Uint8Array): { width: number; height: number } {
  const isPng =
    buffer.byteLength >= PNG_HEADER_BYTES &&
    PNG_SIGNATURE.every((byte, index) => buffer[index] === byte) &&
    IHDR_TYPE.every((byte, index) => buffer[12 + index] === byte);
  if (!isPng) throw new Error("buffer is not a PNG with an IHDR chunk");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Throws, naming the asset, when `buffer` is not a PNG of exactly
 * `spec.width` x `spec.height` pixels or is larger than `spec.maxBytes`.
 */
export function assertSpec(name: string, buffer: Uint8Array, spec: AssetSpec): void {
  let size: { width: number; height: number };
  try {
    size = readPngSize(buffer);
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  if (size.width !== spec.width || size.height !== spec.height) {
    throw new Error(
      `${name}: rendered ${size.width}x${size.height}, expected ${spec.width}x${spec.height}`,
    );
  }
  if (buffer.byteLength > spec.maxBytes) {
    throw new Error(
      `${name}: ${buffer.byteLength} bytes exceeds the budget of ${spec.maxBytes} bytes`,
    );
  }
}

/**
 * Packs PNG images into a Windows ICO container (PNG-compressed entries,
 * 32 bpp). Each image must be a PNG of at most 256 px per side.
 */
export function encodeIco(pngs: Uint8Array[]): Uint8Array {
  if (pngs.length === 0) throw new Error("encodeIco needs at least one PNG");
  const images = pngs.map((png) => {
    const size = readPngSize(png);
    if (size.width > ICO_MAX_DIMENSION || size.height > ICO_MAX_DIMENSION) {
      throw new Error(
        `ICO entries must be at most ${ICO_MAX_DIMENSION} px, got ${size.width}x${size.height}`,
      );
    }
    return { png, ...size };
  });
  const directoryBytes = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * pngs.length;
  const totalBytes = pngs.reduce((sum, png) => sum + png.byteLength, directoryBytes);
  const ico = new Uint8Array(totalBytes);
  const view = new DataView(ico.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, pngs.length, true);
  let offset = directoryBytes;
  images.forEach(({ png, width, height }, index) => {
    const entry = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * index;
    ico[entry] = width % ICO_MAX_DIMENSION;
    ico[entry + 1] = height % ICO_MAX_DIMENSION;
    ico[entry + 2] = 0;
    ico[entry + 3] = 0;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    ico.set(png, offset);
    offset += png.byteLength;
  });
  return ico;
}
