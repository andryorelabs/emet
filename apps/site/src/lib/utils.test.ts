import { describe, expect, test } from "bun:test";

import { cn } from "./utils";

describe("cn", () => {
  test("joins class names and skips falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  test("lets the last conflicting utility win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("accepts conditional objects and arrays", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });
});
