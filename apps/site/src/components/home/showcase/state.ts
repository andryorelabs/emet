/**
 * Pure state of the showcase: whether ticket #44 is flagged and what each
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

/** Flips the flag on ticket #44. */
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
