import { expect, test } from "bun:test";

import { resolveTabIndex } from "./tab-navigation";

test("ArrowRight on the selected tab selects the next one", () => {
  expect(resolveTabIndex("ArrowRight", 0, 2)).toBe(1);
});

test("arrows wrap at both ends", () => {
  expect(resolveTabIndex("ArrowRight", 1, 2)).toBe(0);
  expect(resolveTabIndex("ArrowLeft", 0, 2)).toBe(1);
});

test("Home and End jump to the first and last tab", () => {
  expect(resolveTabIndex("Home", 1, 3)).toBe(0);
  expect(resolveTabIndex("End", 0, 3)).toBe(2);
});

test("other keys and empty lists do not move", () => {
  expect(resolveTabIndex("Enter", 0, 2)).toBeNull();
  expect(resolveTabIndex("ArrowRight", 0, 0)).toBeNull();
});
