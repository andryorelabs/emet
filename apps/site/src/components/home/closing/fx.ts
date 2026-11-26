/**
 * Living painting effects of the Closing panel: clouds, river and eyes. The eyes
 * look at the install command, or at the pointer while it is over the panel, and
 * blink and glow when the command is copied. Nothing runs under reduced motion, on
 * small or coarse-pointer viewers or without WebGL.
 */
import { paintingFx, VALLEY_PAINTING } from "../graphics/painting-fx";
import type { PaintingData, PaintingFxHandle, PaintingFxOptions } from "../graphics/painting-fx";
import { gazeFor } from "../showcase/fx";

/** The `paintingFx` entry point; tests pass a fake. */
type PaintingFxFactory = (host: HTMLElement, options: PaintingFxOptions) => PaintingFxHandle;

const CLOSING_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1353.5, 674],
    [1388.1, 674.7],
  ],
  objectPosition: [0.5, 1],
};

/** Starts the Closing effects on `host`, with the eyes looking at `command`. */
export function initClosingFx(
  host: HTMLElement,
  command: HTMLElement,
  createFx: PaintingFxFactory = paintingFx,
): { blink(): void; destroy(): void } {
  let pointer: { x: number; y: number } | null = null;
  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
  };
  addEventListener("pointermove", onPointerMove, { passive: true });

  const handle = createFx(host, {
    painting: CLOSING_PAINTING,
    effects: { clouds: true, water: true, eyes: true },
    gaze: () => gazeFor(host, host, command, pointer),
  });

  return {
    blink() {
      handle.blink();
      handle.glow();
    },
    destroy() {
      removeEventListener("pointermove", onPointerMove);
      handle.destroy();
    },
  };
}
