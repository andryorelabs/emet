import { describe, expect, test } from "bun:test";

import { INSTALL_TARGET_KEY, readInstallTarget, writeInstallTarget } from "./install-target";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage = {
  getItem(): string | null {
    throw new Error("blocked");
  },
  setItem(): void {
    throw new Error("blocked");
  },
};

describe("install target storage", () => {
  test("round-trips the chosen target", () => {
    const storage = memoryStorage();
    writeInstallTarget(storage, "Codex");
    expect(storage.getItem(INSTALL_TARGET_KEY)).toBe("Codex");
    expect(readInstallTarget(storage)).toBe("Codex");
  });

  test("reads null when nothing is stored", () => {
    expect(readInstallTarget(memoryStorage())).toBe(null);
  });

  test("swallows storage errors", () => {
    expect(readInstallTarget(throwingStorage)).toBe(null);
    expect(() => writeInstallTarget(throwingStorage, "Codex")).not.toThrow();
  });

  test("tolerates missing storage", () => {
    expect(readInstallTarget(null)).toBe(null);
    expect(() => writeInstallTarget(null, "Codex")).not.toThrow();
  });
});
