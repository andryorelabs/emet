import { describe, expect, test } from "bun:test";

import { initialState, toggle, viewFor } from "./state";

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
