/**
 * Bundled module of the About section: scrubs the aleph strike with scroll
 * and reveals the portrait through the pixel mosaic. Without JS or under
 * reduced motion the strike stands complete and the portrait shows as is.
 */
import { initPixelReveal } from "./pixel-reveal";
import { strikeProgress } from "./strike";

export const REVEAL_DURATION_MS = 1400;

/** Wires one About section; returns a teardown that removes every listener. */
export function mountAbout(root: HTMLElement, reduce: boolean): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>("canvas[data-pixel-reveal]");
  const image = root.querySelector<HTMLImageElement>(".portrait img");
  const reveal =
    canvas && image
      ? initPixelReveal(canvas, image, { durationMs: REVEAL_DURATION_MS, reduce })
      : undefined;
  if (reduce) {
    return () => {
      reveal?.destroy();
    };
  }

  let frame = 0;
  const write = (): void => {
    frame = 0;
    const progress = strikeProgress(root.getBoundingClientRect().top, innerHeight);
    root.style.setProperty("--strike", progress.toFixed(4));
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(write);
  };

  write();
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  return () => {
    reveal?.destroy();
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
}

function mount(): void {
  const root = document.querySelector<HTMLElement>("section.about");
  if (!root) return;
  mountAbout(root, globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

mount();
