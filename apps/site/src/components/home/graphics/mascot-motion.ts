/**
 * Mascot motion of the install banner: the sprite sleeps until its banner
 * enters the viewport, then wakes and works, cycling the work frames at the
 * pace the terminal mod uses. Without script, or with reduced motion, it
 * stays asleep, which is the markup.
 */

const VIEW_THRESHOLD = 0.6;
const WAKE_DELAY_MS = 900;
const WORK_STATE = "work";
const SLEEP_STATE = "sleep";
const FALLBACK_FRAME_MS = 250;

function framesOf(sprite: Element, state: string): HTMLElement[] {
  return [...sprite.querySelectorAll<HTMLElement>(`.mascot-frame[data-state="${state}"]`)];
}

function showOnly(frames: readonly HTMLElement[], shown: HTMLElement | undefined): void {
  for (const frame of frames) frame.classList.toggle("is-on", frame === shown);
}

function wakeMascot(sprite: Element): void {
  const asleep = framesOf(sprite, SLEEP_STATE);
  const working = framesOf(sprite, WORK_STATE);
  let index = 0;
  const step = (): void => {
    const frame = working[index % working.length];
    showOnly(asleep, undefined);
    showOnly(working, frame);
    index += 1;
    globalThis.setTimeout(step, Number(frame?.dataset["ms"] ?? 0) || FALLBACK_FRAME_MS);
  };
  if (working.length > 0) step();
}

/** Arms every `[data-mascot]` under `root`; does nothing with reduced motion. */
export function initMascot(root: ParentNode): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        globalThis.setTimeout(() => wakeMascot(entry.target), WAKE_DELAY_MS);
      }
    },
    { threshold: VIEW_THRESHOLD },
  );
  for (const sprite of root.querySelectorAll("[data-mascot]")) observer.observe(sprite);
}
