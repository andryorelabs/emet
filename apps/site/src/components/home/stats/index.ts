/**
 * Entry of the stats band: arms the odometer and starts the topographic
 * canvas. With reduced motion the odometer stays plain text and the canvas
 * paints one still frame.
 */
import { initOdometer } from "./odometer";
import { initTopo } from "./topo";

/** Wires the `.stats` band found under `root`; does nothing when there is none. */
export function initStats(root: ParentNode): void {
  const band = root.querySelector<HTMLElement>(".stats");
  if (!band) return;
  initOdometer(band);
  const canvas = band.querySelector<HTMLCanvasElement>("canvas[data-topo]");
  if (!canvas) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  initTopo(canvas, { color: getComputedStyle(canvas).color, reduce });
}
