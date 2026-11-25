import { describe, expect, test } from "bun:test";

import { isApplePlatform, isSearchSlashKey, isSearchToggleKey } from "./search-shortcut";

describe("isApplePlatform", () => {
  test("detects macOS and iOS platforms", () => {
    expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
    expect(isApplePlatform({ platform: "iPhone" })).toBe(true);
    expect(isApplePlatform({ platform: "iPad" })).toBe(true);
    expect(isApplePlatform({ platform: "iPod" })).toBe(true);
  });

  test("treats other platforms as non-Apple", () => {
    expect(isApplePlatform({ platform: "Win32" })).toBe(false);
    expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isApplePlatform({ platform: "Linux armv81", userAgent: "Android 14" })).toBe(false);
  });

  test("falls back to the user agent when the platform is empty or missing", () => {
    expect(
      isApplePlatform({ platform: "", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }),
    ).toBe(true);
    expect(isApplePlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(
      true,
    );
    expect(isApplePlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
  });

  test("defaults to false with nothing to read", () => {
    expect(isApplePlatform({})).toBe(false);
  });
});

describe("isSearchToggleKey", () => {
  test("accepts Ctrl K and Command K", () => {
    expect(isSearchToggleKey({ key: "k", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSearchToggleKey({ key: "k", ctrlKey: false, metaKey: true })).toBe(true);
  });

  test("rejects a bare K and other keys", () => {
    expect(isSearchToggleKey({ key: "k", ctrlKey: false, metaKey: false })).toBe(false);
    expect(isSearchToggleKey({ key: "j", ctrlKey: true, metaKey: false })).toBe(false);
  });
});

describe("isSearchSlashKey", () => {
  const plain = { key: "/", ctrlKey: false, metaKey: false, altKey: false };
  const outside = { closest: () => null };

  test("accepts a bare slash outside a text field", () => {
    expect(isSearchSlashKey(plain, outside)).toBe(true);
    expect(isSearchSlashKey(plain, null)).toBe(true);
  });

  test("rejects a slash inside a text field", () => {
    expect(isSearchSlashKey(plain, { closest: () => ({}) })).toBe(false);
  });

  test("rejects a slash with a modifier and other keys", () => {
    expect(isSearchSlashKey({ ...plain, ctrlKey: true }, outside)).toBe(false);
    expect(isSearchSlashKey({ ...plain, altKey: true }, outside)).toBe(false);
    expect(isSearchSlashKey({ ...plain, key: "a" }, outside)).toBe(false);
  });
});
