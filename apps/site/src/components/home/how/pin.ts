import { initDitherImage, type DitherImage } from "../graphics/dither-image";

/** The active step of the pinned How it works runway. */
export type HowStep = 0 | 1 | 2;

/** Lifecycle of one step: upcoming, expanded or collapsed to one line. */
export type StepState = "idle" | "on" | "done";

/** Pin progress at which step 1 takes over. */
const STEP_ONE_AT = 0.3;
/** Pin progress at which step 2 takes over. */
const STEP_TWO_AT = 0.62;
/** Pin progress at which the dither reveal starts. */
const DITHER_START = 0.1;
/** Share of the pin the dither reveal spans. */
const DITHER_SPAN = 0.75;
/** Dark, mid and light colours of the stage dither ramp (a canvas palette, not page ink). */
export const DITHER_PALETTE: readonly [string, string, string] = ["#161c17", "#51852f", "#ede9d2"];

const PIN_QUERY = "(min-width: 901px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Step shown at a pin progress: 0 below 0.3, 1 below 0.62, otherwise 2. */
export function howStep(progress: number): HowStep {
  if (progress < STEP_ONE_AT) return 0;
  return progress < STEP_TWO_AT ? 1 : 2;
}

/** Pin progress 0..1 of a runway whose top edge is at `top` with `height` in a `viewport`-tall window. */
export function pinProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  return travel <= 0 ? 1 : clamp01(-top / travel);
}

/** Smoothstep-eased dither reveal progress for a pin progress; 0 is coarse and 1 is the plain image. */
export function ditherProgress(progress: number): number {
  const t = clamp01((progress - DITHER_START) / DITHER_SPAN);
  return t * t * (3 - 2 * t);
}

/** State of the step at `index` while `active` is the current one: later steps wait, earlier ones are done. */
export function stepState(index: number, active: HowStep): StepState {
  if (index === active) return "on";
  return index < active ? "done" : "idle";
}

function applyStep(root: HTMLElement, steps: readonly HTMLElement[], active: HowStep): void {
  root.dataset.step = String(active);
  for (const stage of root.querySelectorAll<HTMLElement>("[data-how-stage]")) {
    stage.dataset.step = String(active);
  }
  for (const [index, step] of steps.entries()) step.dataset.stepState = stepState(index, active);
  for (const overlay of root.querySelectorAll<HTMLElement>("[data-streams]")) {
    overlay.dataset.stage = String(active);
  }
}

function clearStep(root: HTMLElement, steps: readonly HTMLElement[]): void {
  delete root.dataset.step;
  delete root.dataset.pinned;
  for (const stage of root.querySelectorAll<HTMLElement>("[data-how-stage]")) {
    delete stage.dataset.step;
  }
  for (const step of steps) delete step.dataset.stepState;
  for (const overlay of root.querySelectorAll<HTMLElement>("[data-streams]")) {
    delete overlay.dataset.stage;
  }
}

/**
 * Drives the pinned runway under `root` (`[data-how-pin]`): scroll progress picks the
 * active `.step`, marks it on and the earlier ones done through `data-step-state`,
 * mirrors it on `data-step` and on every `[data-streams]` as `data-stage`, and eases
 * the dither reveal of the stage canvas. Below 901px or with reduced motion nothing is
 * touched, so the stacked markup keeps its final state. `createDither` is a test seam.
 */
export function initHowPin(
  root: HTMLElement,
  createDither: typeof initDitherImage = initDitherImage,
): void {
  if (matchMedia(REDUCED_QUERY).matches) return;
  const steps = [...root.querySelectorAll<HTMLElement>(".step")];
  if (steps.length === 0) return;
  const wide = matchMedia(PIN_QUERY);
  const canvas = root.querySelector<HTMLCanvasElement>("canvas[data-dither-src]");
  let eased = 0;
  let dither: DitherImage | null = null;
  let pending = 0;
  let last = -1;

  const update = (): void => {
    pending = 0;
    const rect = root.getBoundingClientRect();
    const progress = pinProgress(rect.top, rect.height, innerHeight);
    const active = howStep(progress);
    if (active !== last) {
      last = active;
      applyStep(root, steps, active);
    }
    eased = ditherProgress(progress);
  };
  const schedule = (): void => {
    if (!pending) pending = requestAnimationFrame(update);
  };
  const onFocusIn = (event: FocusEvent): void => {
    const index = steps.findIndex(
      (step) => event.target instanceof Node && step.contains(event.target),
    );
    if (index < 0 || index === last) return;
    last = index;
    applyStep(root, steps, index === 0 ? 0 : index === 1 ? 1 : 2);
  };
  const start = (): void => {
    root.addEventListener("focusin", onFocusIn);
    root.dataset.pinned = "true";
    const source = canvas?.dataset.ditherSrc;
    if (canvas && source && !dither) {
      dither = createDither(canvas, source, {
        palette: DITHER_PALETTE,
        getProgress: () => eased,
        reduce: false,
      });
      if (!dither) canvas.hidden = true;
    }
    last = -1;
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
  };
  const stop = (): void => {
    root.removeEventListener("focusin", onFocusIn);
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
    cancelAnimationFrame(pending);
    pending = 0;
    dither?.destroy();
    dither = null;
    clearStep(root, steps);
  };

  if (wide.matches) start();
  wide.addEventListener("change", () => {
    if (wide.matches) start();
    else stop();
  });
}
