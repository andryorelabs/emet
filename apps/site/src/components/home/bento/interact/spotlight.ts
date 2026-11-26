/**
 * Pointer spotlight: a soft light that follows the pointer across the bento
 * cards. It needs a fine hover pointer, and does nothing under reduced motion.
 */

const SPOTLIGHT_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const CARD_SELECTOR = ".bento-card";

/**
 * Tracks the pointer over `root` and exposes its position inside the hovered
 * card as `--spot-x` and `--spot-y`, with `data-spot` set while it is there.
 */
export function initSpotlight(root: HTMLElement): void {
  if (!matchMedia(SPOTLIGHT_QUERY).matches) return;
  let active: HTMLElement | undefined;

  const clear = (): void => {
    if (active !== undefined) delete active.dataset.spot;
    active = undefined;
  };

  root.addEventListener("pointermove", (event) => {
    const card =
      event.target instanceof Element ? event.target.closest<HTMLElement>(CARD_SELECTOR) : null;
    if (card === null) {
      clear();
      return;
    }
    if (card !== active) clear();
    const box = card.getBoundingClientRect();
    card.style.setProperty("--spot-x", `${(event.clientX - box.left).toFixed(0)}px`);
    card.style.setProperty("--spot-y", `${(event.clientY - box.top).toFixed(0)}px`);
    card.dataset.spot = "";
    active = card;
  });
  root.addEventListener("pointerleave", clear);
}
