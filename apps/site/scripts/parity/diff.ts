/** Largest per-channel difference that still counts as the same pixel. */
export const CHANNEL_TOLERANCE = 16;

/** Bytes per pixel of a raw RGBA buffer. */
const BYTES_PER_PIXEL = 4;

/** The fraction (0 to 1) of pixels that differ between two raw RGBA buffers; buffers of different sizes differ entirely. */
export function diffRatio(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 1;
  const pixels = a.length / BYTES_PER_PIXEL;
  if (!Number.isInteger(pixels)) return 1;
  if (pixels === 0) return 0;
  let differing = 0;
  for (let offset = 0; offset < a.length; offset += BYTES_PER_PIXEL) {
    for (let channel = 0; channel < BYTES_PER_PIXEL; channel += 1) {
      const delta = Math.abs((a[offset + channel] ?? 0) - (b[offset + channel] ?? 0));
      if (delta > CHANNEL_TOLERANCE) {
        differing += 1;
        break;
      }
    }
  }
  return differing / pixels;
}
