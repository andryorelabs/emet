/**
 * Living painting effects of How it works: clouds and eyes on the stage painting,
 * drawn only once the dither reveal has finished (there is no river to flow). Nothing
 * runs under reduced motion, on small or coarse-pointer viewers or without WebGL, and
 * the stage keeps the plain painting.
 */
import { paintingFx, VALLEY_PAINTING } from "../graphics/painting-fx";
import type { PaintingData, PaintingFxHandle, PaintingFxOptions } from "../graphics/painting-fx";
import { ditherProgress, pinProgress } from "./pin";

/** The `paintingFx` entry point; tests pass a fake. */
type PaintingFxFactory = (host: HTMLElement, options: PaintingFxOptions) => PaintingFxHandle;

/** Dither progress from which the stage counts as revealed. */
const DITHER_DONE_AT = 0.98;

const STAGE_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1352.75, 671],
    [1387.25, 671.9],
  ],
  objectPosition: [0.5, 0.5],
};

/** Whether the dither reveal of the pinned `runway` is finished; an unpinned runway is already final. */
export function isRunwayRevealed(runway: HTMLElement): boolean {
  if (runway.dataset.pinned !== "true") return true;
  const rect = runway.getBoundingClientRect();
  return ditherProgress(pinProgress(rect.top, rect.height, innerHeight)) >= DITHER_DONE_AT;
}

/** Starts the stage effects on `stage`; they draw only while `isDitherDone()` holds. */
export function initHowFx(
  stage: HTMLElement,
  isDitherDone: () => boolean,
  createFx: PaintingFxFactory = paintingFx,
): { destroy(): void } {
  const handle = createFx(stage, {
    painting: STAGE_PAINTING,
    effects: { clouds: true, eyes: true },
    when: isDitherDone,
  });
  return {
    destroy() {
      handle.destroy();
    },
  };
}
