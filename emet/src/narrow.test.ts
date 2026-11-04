import { describe, expect, test } from "bun:test";
import { errnoCode, errorMessage, isObject, isOneOf } from "./narrow";

describe("isObject", () => {
  test("accepts objects and arrays", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
  });

  test("rejects null and primitives", () => {
    for (const value of [null, undefined, "x", 1, true]) expect(isObject(value)).toBe(false);
  });
});

describe("errorMessage", () => {
  test("reads the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  test("stringifies anything else", () => {
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("errnoCode", () => {
  test("reads a string code", () => {
    expect(errnoCode(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe("ENOENT");
  });

  test("returns undefined for non-objects and non-string codes", () => {
    expect(errnoCode("ENOENT")).toBeUndefined();
    expect(errnoCode({ code: 2 })).toBeUndefined();
    expect(errnoCode({})).toBeUndefined();
  });
});

describe("isOneOf", () => {
  test("matches members only", () => {
    expect(isOneOf(["a", "b"], "a")).toBe(true);
    expect(isOneOf(["a", "b"], "c")).toBe(false);
    expect(isOneOf(["a", "b"], 1)).toBe(false);
  });
});
