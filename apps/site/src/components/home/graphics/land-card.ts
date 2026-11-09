/**
 * Landing card of how it works: the wave's tickets tick off one by one and
 * the pull request flips from Open to Merged. The final state is the HTML
 * itself (merged, tickets closed), so without script or with reduced motion
 * nothing is touched. Script only walks `data-land` through `armed`, `ticking`
 * and back to `landed`, which the stylesheet turns into transitions.
 */

const VIEW_THRESHOLD = 0.6;
const TICK_DELAY_MS = 500;
const LAND_DELAY_MS = 1400;

/** Arms every `[data-land]` under `root`; does nothing with reduced motion. */
export function initLandCard(root: ParentNode): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cards = [...root.querySelectorAll<HTMLElement>("[data-land]")];
  if (cards.length === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const card = entry.target;
        if (!entry.isIntersecting || !(card instanceof HTMLElement)) continue;
        observer.unobserve(card);
        globalThis.setTimeout(() => (card.dataset["land"] = "ticking"), TICK_DELAY_MS);
        globalThis.setTimeout(() => (card.dataset["land"] = "landed"), LAND_DELAY_MS);
      }
    },
    { threshold: VIEW_THRESHOLD },
  );
  for (const card of cards) {
    card.dataset["land"] = "armed";
    observer.observe(card);
  }
}
