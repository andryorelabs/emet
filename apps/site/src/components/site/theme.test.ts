import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { THEME_INIT_HASH, THEME_INIT_SCRIPT } from "./theme";
import {
  THEME_STORAGE_KEY,
  initThemeSelects,
  menuIndexAfterKey,
  parseThemeChoice,
  readStoredTheme,
} from "./theme-menu";

const MARKUP = `
<div class="theme-select" data-theme-select hidden>
  <button type="button" class="theme-button" aria-haspopup="menu" aria-expanded="false"></button>
  <div class="theme-menu" role="menu" hidden>
    <button type="button" role="menuitemradio" aria-checked="false" data-choice="light"></button>
    <button type="button" role="menuitemradio" aria-checked="false" data-choice="dark"></button>
    <button type="button" role="menuitemradio" aria-checked="false" data-choice="system"></button>
  </div>
</div>`;

let osDark = false;
let osListeners: (() => void)[] = [];

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      get matches() {
        return osDark;
      },
      addEventListener: (_type: string, listener: () => void) => osListeners.push(listener),
    }),
  });
}

function runInitScript(): void {
  window.eval(THEME_INIT_SCRIPT);
}

function themeButton(): HTMLElement {
  const button = document.querySelector<HTMLElement>(".theme-button");
  if (button === null) throw new Error("no theme button");
  return button;
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

function rowOf(choice: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-choice="${choice}"]`);
  if (row === null) throw new Error(`no ${choice} row`);
  return row;
}

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  localStorage.clear();
  osDark = false;
  osListeners = [];
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
  document.body.innerHTML = MARKUP;
  installMatchMedia();
});

describe("THEME_INIT_HASH", () => {
  test("is the sha256 of the exact script string", () => {
    const expected: string = `sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}`;
    expect<string>(THEME_INIT_HASH).toBe(expected);
  });

  test("the script has no template placeholder left", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("${");
  });
});

describe("the init script", () => {
  test("a stored dark choice puts class dark on html", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  test("a stored light choice wins over a dark OS", () => {
    osDark = true;
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    const root = document.documentElement;
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset["theme"]).toBe("light");
    const colors = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute("content"),
    );
    expect(colors).toEqual(["#f4fdf6", "#f4fdf6"]);
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light",
    );
  });

  test("system sets no class and follows the OS live", () => {
    runInitScript();
    const root = document.documentElement;
    expect(root.className).toBe("");
    expect(root.dataset["theme"]).toBe("light");
    expect(root.dataset["themeChoice"]).toBe("system");
    osDark = true;
    for (const listener of osListeners) listener();
    expect(root.dataset["theme"]).toBe("dark");
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light dark",
    );
  });

  test("keeps exactly two theme-color metas and one color-scheme meta", () => {
    runInitScript();
    window.dispatchEvent(new CustomEvent("emet:theme", { detail: "dark" }));
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(2);
    expect(document.querySelectorAll('meta[name="color-scheme"]').length).toBe(1);
  });

  test("an unreadable storage falls back to system", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    runInitScript();
    if (original !== undefined) Object.defineProperty(window, "localStorage", original);
    expect(document.documentElement.dataset["themeChoice"]).toBe("system");
  });
});

describe("theme helpers", () => {
  test("parseThemeChoice accepts only the three choices", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("blue")).toBeUndefined();
    expect(parseThemeChoice(null)).toBeUndefined();
  });

  test("readStoredTheme defaults to system", () => {
    expect(readStoredTheme()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "nope");
    expect(readStoredTheme()).toBe("system");
  });

  test("menuIndexAfterKey wraps and jumps", () => {
    expect(menuIndexAfterKey("ArrowDown", 2, 3)).toBe(0);
    expect(menuIndexAfterKey("ArrowUp", 0, 3)).toBe(2);
    expect(menuIndexAfterKey("Home", 2, 3)).toBe(0);
    expect(menuIndexAfterKey("End", 0, 3)).toBe(2);
    expect(menuIndexAfterKey("a", 0, 3)).toBeUndefined();
  });
});

describe("the theme menu", () => {
  beforeEach(() => {
    runInitScript();
    initThemeSelects();
  });

  test("shows itself and opens on ArrowDown with the checked row focused", () => {
    const root = document.querySelector<HTMLElement>("[data-theme-select]");
    const button = themeButton();
    expect(root?.hidden).toBe(false);
    key(button, "ArrowDown");
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(rowOf("system"));
    expect(rowOf("system").getAttribute("aria-checked")).toBe("true");
  });

  test("ArrowDown, ArrowDown, Enter applies the next choice and returns focus", () => {
    const button = themeButton();
    key(button, "ArrowDown");
    key(rowOf("system"), "ArrowDown");
    expect(document.activeElement).toBe(rowOf("light"));
    rowOf("light").click();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes and returns focus to the button", () => {
    const button = document.querySelector<HTMLElement>(".theme-button");
    button?.click();
    key(rowOf("system"), "Escape");
    expect(document.querySelector<HTMLElement>(".theme-menu")?.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  test("End and Home move to the last and first rows", () => {
    document.querySelector<HTMLElement>(".theme-button")?.click();
    key(rowOf("system"), "Home");
    expect(document.activeElement).toBe(rowOf("light"));
    key(rowOf("light"), "End");
    expect(document.activeElement).toBe(rowOf("system"));
  });

  test("a click outside closes the menu", () => {
    document.querySelector<HTMLElement>(".theme-button")?.click();
    document.body.click();
    expect(document.querySelector<HTMLElement>(".theme-menu")?.hidden).toBe(true);
  });

  test("Tab closes the menu", () => {
    document.querySelector<HTMLElement>(".theme-button")?.click();
    key(rowOf("system"), "Tab");
    expect(document.querySelector<HTMLElement>(".theme-menu")?.hidden).toBe(true);
  });
});
