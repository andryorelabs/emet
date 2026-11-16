import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { THEME_CHANGE_EVENT, initThemeSelects, readStoredTheme } from "./theme-menu";

const MARKUP = `
<div class="theme-select" data-theme-select hidden>
  <button type="button" class="theme-button" aria-haspopup="menu" aria-expanded="false"></button>
  <div class="theme-menu" role="menu" hidden>
    <button type="button" role="menuitemradio" aria-checked="false" data-choice="light"></button>
    <button type="button" role="menuitemradio" aria-checked="false" data-choice="dark"></button>
  </div>
</div>`;

const unavailable = {
  getItem: () => {
    throw new Error("storage unavailable");
  },
};

describe("readStoredTheme", () => {
  test("reads a valid choice from the given storage", () => {
    expect(readStoredTheme({ getItem: () => "dark" })).toBe("dark");
  });

  test("falls back to system when the storage throws", () => {
    expect(readStoredTheme(unavailable)).toBe("system");
  });
});

describe("choosing a theme when storage is blocked", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
    document.body.innerHTML = MARKUP;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: unavailable.getItem,
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  test("still announces the choice and closes the menu", () => {
    const announced: unknown[] = [];
    window.addEventListener(THEME_CHANGE_EVENT, (event) => {
      if (event instanceof CustomEvent) announced.push(event.detail);
    });
    initThemeSelects();
    document.querySelector<HTMLElement>(".theme-button")?.click();
    const menu = document.querySelector<HTMLElement>(".theme-menu");
    expect(menu?.hidden).toBe(false);
    document.querySelector<HTMLElement>('[data-choice="dark"]')?.click();
    expect(announced).toEqual(["dark"]);
    expect(menu?.hidden).toBe(true);
  });
});
