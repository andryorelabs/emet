/**
 * Living portrait of the About section: the golem's eyes follow the cursor and
 * the clouds drift once the pixel reveal has finished. Nothing runs under
 * reduced motion, on small or coarse-pointer viewers or without WebGL, and the
 * portrait stays as the still painting.
 */
import { paintingFx, PORTRAIT_PAINTING } from "../graphics/painting-fx";
import type { PaintingFxHandle, PaintingFxOptions } from "../graphics/painting-fx";

/** The `paintingFx` entry point; tests pass a fake. */
type PaintingFxFactory = (host: HTMLElement, options: PaintingFxOptions) => PaintingFxHandle;

const PORTRAIT_EYE_SCALE = 4.4;

/** Starts the portrait effects on `portrait`; they draw only while `isRevealDone()` holds. */
export function initAboutFx(
  portrait: HTMLElement,
  isRevealDone: () => boolean,
  createFx: PaintingFxFactory = paintingFx,
): { destroy(): void } {
  let pointer: { x: number; y: number } | null = null;
  const onPointerMove = (event: PointerEvent): void => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  addEventListener("pointermove", onPointerMove, { passive: true });

  const handle = createFx(portrait, {
    painting: PORTRAIT_PAINTING,
    effects: { clouds: true, eyes: true },
    eyeScale: PORTRAIT_EYE_SCALE,
    when: isRevealDone,
    gaze: () => {
      if (!pointer) return null;
      const rect = portrait.getBoundingClientRect();
      return { x: pointer.x - rect.left, y: pointer.y - rect.top };
    },
  });

  return {
    destroy() {
      removeEventListener("pointermove", onPointerMove);
      handle.destroy();
    },
  };
}
