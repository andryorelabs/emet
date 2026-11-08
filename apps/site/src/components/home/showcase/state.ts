/**
 * Pure state of the showcase: whether ticket #255 is flagged and what each
 * state looks like. The DOM wiring lives in `showcase.ts`.
 */

export interface ShowcaseState {
  held: boolean;
}

export interface ShowcaseView {
  held: boolean;
  pressed: "true" | "false";
  headingKey: "heading" | "headingHeld";
  statusKey: "status" | "statusHeld";
  dusk: boolean;
  letterFaded: boolean;
}

export const initialState: ShowcaseState = { held: false };

/** Flips the flag on ticket #255. */
export function toggle(state: ShowcaseState): ShowcaseState {
  return { held: !state.held };
}

/** Describes what the page shows for a state. */
export function viewFor(state: ShowcaseState): ShowcaseView {
  const { held } = state;
  return {
    held,
    pressed: held ? "true" : "false",
    headingKey: held ? "headingHeld" : "heading",
    statusKey: held ? "statusHeld" : "status",
    dusk: held,
    letterFaded: held,
  };
}

const HOLD_AT = 0.55;
const RELEASE_AT = 0.45;

/**
 * Scroll-driven state with hysteresis: held at progress >= 0.55, merged at
 * <= 0.45 and unchanged in the dead band between.
 */
export function stateForProgress(progress: number, previous: ShowcaseState): ShowcaseState {
  if (progress >= HOLD_AT) return previous.held ? previous : { held: true };
  if (progress <= RELEASE_AT) return previous.held ? { held: false } : previous;
  return previous;
}

/**
 * Progress through a pinned runway: 0 when its top meets the viewport top,
 * 1 when its bottom meets the viewport bottom, clamped.
 */
export function runwayProgress(
  box: { top: number; height: number },
  viewportHeight: number,
): number {
  const travel = box.height - viewportHeight;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, -box.top / travel));
}

export interface ScrollTrack {
  natural: ShowcaseState;
  overridden: boolean;
}

export const initialTrack: ScrollTrack = { natural: initialState, overridden: false };

/** Records a click: flips the state and holds it until the next threshold crossing. */
export function clickStep(
  state: ShowcaseState,
  track: ScrollTrack,
): { state: ShowcaseState; track: ScrollTrack } {
  return { state: toggle(state), track: { natural: track.natural, overridden: true } };
}

/** Applies scroll progress; a click override survives until the scroll state crosses a threshold. */
export function scrollStep(
  progress: number,
  state: ShowcaseState,
  track: ScrollTrack,
): { state: ShowcaseState; track: ScrollTrack } {
  const natural = stateForProgress(progress, track.natural);
  const crossed = natural.held !== track.natural.held;
  if (track.overridden && !crossed) return { state, track: { natural, overridden: true } };
  return { state: natural, track: { natural, overridden: false } };
}
