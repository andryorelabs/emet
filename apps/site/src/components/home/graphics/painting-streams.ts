/**
 * Staging of the How it works painting overlay. The HTML is already the final
 * drawing (stage 2), so without script, with reduced motion and at 1000px and
 * below nothing is touched. Script only sets `data-stage` on `[data-streams]`
 * from the exchange in the middle band of the viewport, which the stylesheet
 * turns into the draw-in, the flow and the pop.
 */

type Stage = 0 | 1 | 2;

const DESKTOP_QUERY = "(min-width: 1001px)";
const MIDDLE_BAND_MARGIN = "-40% 0px -40% 0px";
const STAGES: readonly Stage[] = [0, 1, 2];

/** Index of the largest visible ratio, 0 when none is visible; ties go to the earlier one. */
export function pickStage(ratios: readonly number[]): Stage {
  let best: Stage = 0;
  let bestRatio = 0;
  for (const stage of STAGES) {
    const ratio = ratios[stage] ?? 0;
    if (ratio > bestRatio) {
      best = stage;
      bestRatio = ratio;
    }
  }
  return best;
}

/** Stages every `[data-streams]` under `root` from the `.exchange` articles; no-op with reduced motion or below 1001px. */
export function initPaintingStreams(root: ParentNode): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia(DESKTOP_QUERY).matches) return;
  const overlays = [...root.querySelectorAll<HTMLElement>("[data-streams]")];
  const exchanges = [...root.querySelectorAll<HTMLElement>(".exchange")];
  if (overlays.length === 0 || exchanges.length === 0) return;
  const ratios = exchanges.map(() => 0);
  const setStage = (stage: Stage): void => {
    for (const overlay of overlays) overlay.dataset["stage"] = String(stage);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = exchanges.findIndex((exchange) => exchange === entry.target);
        if (index >= 0) ratios[index] = !entry.isIntersecting ? 0 : entry.intersectionRatio;
      }
      setStage(pickStage(ratios));
    },
    { rootMargin: MIDDLE_BAND_MARGIN, threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  setStage(0);
  for (const exchange of exchanges) observer.observe(exchange);
}
