import { describe, expect, test } from "bun:test";

import {
  clickStep,
  initialState,
  initialTrack,
  runwayProgress,
  scrollStep,
  stateForProgress,
  toggle,
  viewFor,
} from "./state";

describe("showcase state", () => {
  test("starts merged, day painting, switch off", () => {
    expect(viewFor(initialState)).toEqual({
      held: false,
      pressed: "false",
      headingKey: "heading",
      statusKey: "status",
      dusk: false,
      letterFaded: false,
    });
  });

  test("flagging holds the wave: dusk, waits, switch on, letter faded", () => {
    expect(viewFor(toggle(initialState))).toEqual({
      held: true,
      pressed: "true",
      headingKey: "headingHeld",
      statusKey: "statusHeld",
      dusk: true,
      letterFaded: true,
    });
  });

  test("flagging twice returns to the merged state", () => {
    expect(viewFor(toggle(toggle(initialState)))).toEqual(viewFor(initialState));
  });
});

describe("stateForProgress", () => {
  const merged = { held: false };
  const held = { held: true };

  test("holds at 0.55 and above, releases at 0.45 and below", () => {
    expect(stateForProgress(0.55, merged)).toEqual(held);
    expect(stateForProgress(1, merged)).toEqual(held);
    expect(stateForProgress(0.45, held)).toEqual(merged);
    expect(stateForProgress(0, held)).toEqual(merged);
  });

  test("keeps the previous state inside the dead band", () => {
    expect(stateForProgress(0.5, merged)).toEqual(merged);
    expect(stateForProgress(0.5, held)).toEqual(held);
    expect(stateForProgress(0.54, merged)).toEqual(merged);
    expect(stateForProgress(0.46, held)).toEqual(held);
  });
});

describe("runwayProgress", () => {
  test("is 0 at the runway top and 1 at its bottom", () => {
    expect(runwayProgress({ top: 0, height: 2000 }, 800)).toBe(0);
    expect(runwayProgress({ top: -1200, height: 2000 }, 800)).toBe(1);
    expect(runwayProgress({ top: -600, height: 2000 }, 800)).toBe(0.5);
  });

  test("clamps outside the runway and tolerates a short runway", () => {
    expect(runwayProgress({ top: 300, height: 2000 }, 800)).toBe(0);
    expect(runwayProgress({ top: -5000, height: 2000 }, 800)).toBe(1);
    expect(runwayProgress({ top: -10, height: 600 }, 800)).toBe(0);
  });
});

describe("click override", () => {
  test("a click holds against scroll inside the same zone", () => {
    const clicked = clickStep(initialState, initialTrack);
    expect(clicked.state.held).toBe(true);
    const scrolled = scrollStep(0.2, clicked.state, clicked.track);
    expect(scrolled.state.held).toBe(true);
    expect(scrolled.track.overridden).toBe(true);
  });

  test("the next threshold crossing clears the override and follows scroll", () => {
    const clicked = clickStep(initialState, initialTrack);
    const crossed = scrollStep(0.6, clicked.state, clicked.track);
    expect(crossed.track.overridden).toBe(false);
    expect(crossed.state.held).toBe(true);
    expect(scrollStep(0.3, crossed.state, crossed.track).state.held).toBe(false);
  });

  test("a click against the scroll side lasts until scroll crosses", () => {
    const heldByScroll = scrollStep(0.7, initialState, initialTrack);
    const clicked = clickStep(heldByScroll.state, heldByScroll.track);
    expect(clicked.state.held).toBe(false);
    expect(scrollStep(0.9, clicked.state, clicked.track).state.held).toBe(false);
    const crossed = scrollStep(0.2, clicked.state, clicked.track);
    expect(crossed.state.held).toBe(false);
    expect(crossed.track.overridden).toBe(false);
    expect(scrollStep(0.7, crossed.state, crossed.track).state.held).toBe(true);
  });
});
