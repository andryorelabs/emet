import type { Point } from "../graphics/painting-fx";

const EASE = 0.1;

/** Moves `current` a tenth of the way to `target`, the smoothing of the soft cursor light. */
export function easePoint(current: Point, target: Point, amount: number = EASE): Point {
  return [
    current[0] + (target[0] - current[0]) * amount,
    current[1] + (target[1] - current[1]) * amount,
  ];
}

/** Writes the light position to `--mx`/`--my` and shows it only while the pointer is over the hero. */
export function applyCursorLight(light: HTMLElement, point: Point, active: boolean): void {
  light.style.setProperty("--mx", `${point[0].toFixed(1)}px`);
  light.style.setProperty("--my", `${point[1].toFixed(1)}px`);
  if (active) light.dataset.on = "";
  else delete light.dataset.on;
}
