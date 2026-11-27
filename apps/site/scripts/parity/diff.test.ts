import { describe, expect, test } from "bun:test";

import { CHANNEL_TOLERANCE, diffRatio } from "./diff";

const pixels = (...values: number[][]): Uint8Array => new Uint8Array(values.flat());

describe("diffRatio", () => {
  test("is 0 for identical buffers and empty buffers", () => {
    expect(diffRatio(pixels([1, 2, 3, 255]), pixels([1, 2, 3, 255]))).toBe(0);
    expect(diffRatio(new Uint8Array(), new Uint8Array())).toBe(0);
  });

  test("counts differing pixels", () => {
    const a = pixels([0, 0, 0, 255], [0, 0, 0, 255]);
    const b = pixels([0, 0, 0, 255], [255, 0, 0, 255]);
    expect(diffRatio(a, b)).toBe(0.5);
  });

  test("ignores deltas within the tolerance", () => {
    const a = pixels([0, 0, 0, 255]);
    expect(diffRatio(a, pixels([CHANNEL_TOLERANCE, 0, 0, 255]))).toBe(0);
    expect(diffRatio(a, pixels([CHANNEL_TOLERANCE + 1, 0, 0, 255]))).toBe(1);
  });

  test("treats mismatched or malformed buffers as fully different", () => {
    expect(diffRatio(pixels([0, 0, 0, 255]), pixels([0, 0, 0, 255], [0, 0, 0, 255]))).toBe(1);
    expect(diffRatio(new Uint8Array(3), new Uint8Array(3))).toBe(1);
  });
});
