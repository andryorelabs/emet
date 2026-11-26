import type { Size } from "./types";

/** Scale and top-left offset that draw `image` into `box` like CSS `object-fit: cover`. */
export function coverGeometry(
  image: Size,
  box: Size,
  objectPosition: readonly [number, number],
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  return {
    scale,
    offsetX: (box.width - image.width * scale) * objectPosition[0],
    offsetY: (box.height - image.height * scale) * objectPosition[1],
  };
}
