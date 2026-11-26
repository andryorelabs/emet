import { describe, expect, test } from "bun:test";

import { clampDrag, companionState, eyeShift, menuTarget, sectionAtLine } from "./state";

describe("companionState", () => {
  test("follows the section in view", () => {
    expect(companionState("hero", null)).toBe("sleep");
    expect(companionState("how", null)).toBe("work");
    expect(companionState("showcase", null)).toBe("work");
    expect(companionState("faq", null)).toBe("done");
    expect(companionState("closing", null)).toBe("done");
    expect(companionState("other", null)).toBe("work");
  });

  test("lets a visitor action win outside the hero", () => {
    expect(companionState("how", { kind: "approval-hold" })).toBe("done");
    expect(companionState("closing", { kind: "copy" })).toBe("done");
    expect(companionState("showcase", { kind: "flag-toggle", held: true })).toBe("wait");
    expect(companionState("closing", { kind: "flag-toggle", held: false })).toBe("work");
  });

  test("sleeps over the hero whatever the action", () => {
    expect(companionState("hero", { kind: "copy" })).toBe("sleep");
  });
});

describe("sectionAtLine", () => {
  const rects = [
    { id: "hero", top: -500, bottom: 100 },
    { id: "how", top: 100, bottom: 900 },
  ];

  test("finds the section crossing the line", () => {
    expect(sectionAtLine(rects, 50)).toBe("hero");
    expect(sectionAtLine(rects, 450)).toBe("how");
  });

  test("returns an empty id when no section crosses it", () => {
    expect(sectionAtLine(rects, 2000)).toBe("");
  });
});

describe("eyeShift", () => {
  test("scales with distance and clamps to one", () => {
    expect(eyeShift({ x: 200, y: 0 }, { x: 0, y: 0 }, 400)).toEqual({ x: 0.5, y: 0 });
    expect(eyeShift({ x: -900, y: 900 }, { x: 0, y: 0 }, 400)).toEqual({ x: -1, y: 1 });
  });
});

describe("clampDrag", () => {
  test("only allows up and left, within the room", () => {
    expect(clampDrag({ x: 30, y: 20 }, { x: 100, y: 100 })).toEqual({ x: 0, y: 0 });
    expect(clampDrag({ x: -500, y: -40 }, { x: 100, y: 100 })).toEqual({ x: -100, y: -40 });
  });
});

describe("menuTarget", () => {
  test("wraps arrows and jumps with Home and End", () => {
    expect(menuTarget(3, "ArrowDown", 4)).toBe(0);
    expect(menuTarget(0, "ArrowUp", 4)).toBe(3);
    expect(menuTarget(-1, "ArrowDown", 4)).toBe(0);
    expect(menuTarget(2, "Home", 4)).toBe(0);
    expect(menuTarget(1, "End", 4)).toBe(3);
  });

  test("ignores other keys", () => {
    expect(menuTarget(1, "a", 4)).toBeNull();
  });
});
