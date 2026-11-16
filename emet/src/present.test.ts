import { describe, expect, test } from "bun:test";

import { present } from "./present";

describe("present", () => {
  test("returns a defined value unchanged", () => {
    expect(present("value")).toBe("value");
    expect(present(0)).toBe(0);
  });

  test("throws naming the missing value for null and undefined", () => {
    expect(() => {
      present(undefined, "the ticket");
    }).toThrow("Expected the ticket to be present");
    expect(() => {
      present(null);
    }).toThrow("Expected value to be present");
  });
});
