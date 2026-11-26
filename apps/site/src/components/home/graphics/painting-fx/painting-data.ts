import type { PaintingData } from "./types";

/** The 1672x941 valley painting shared by hero, source, held and bookend. */
export const VALLEY_PAINTING: PaintingData = {
  size: { width: 1672, height: 941 },
  eyes: [
    [1352, 672],
    [1385.5, 672.5],
  ],
  eyeScale: 1,
  objectPosition: [0.5, 0.62],
  skyMask: [0.33, 0.43],
  waterRegion: { x: 560, y: 600, width: 600, height: 341 },
  river: [
    {
      points: [
        [603, 627],
        [660, 638],
        [707, 657],
        [747, 677],
        [793, 696],
        [827, 707],
        [850, 718],
      ],
      widths: [8, 9, 11, 13, 14, 14, 14],
    },
    {
      points: [
        [1110, 621],
        [1060, 635],
        [1003, 652],
        [960, 667],
        [940, 680],
        [923, 697],
        [903, 710],
      ],
      widths: [8, 9, 10, 11, 12, 12, 12],
    },
    {
      points: [
        [837, 613],
        [835, 623],
        [853, 637],
        [877, 648],
        [910, 658],
        [932, 667],
      ],
      widths: [4, 4, 4, 4, 4, 4],
    },
    {
      points: [
        [872, 722],
        [862, 780],
        [838, 840],
        [805, 941],
      ],
      widths: [34, 80, 130, 190],
    },
  ],
};

/** The 1122x1402 portrait painting used by About; it has no river. */
export const PORTRAIT_PAINTING: PaintingData = {
  size: { width: 1122, height: 1402 },
  eyes: [
    [571, 760],
    [756, 757],
  ],
  eyeScale: 4.4,
  objectPosition: [0.5, 0.5],
  skyMask: [0.24, 0.3],
  waterRegion: null,
  river: [],
};
