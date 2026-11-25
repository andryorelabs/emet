import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createRequire } from "node:module";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, useLayoutEffect } from "react";

GlobalRegistrator.register();

const layoutEffectPath = createRequire(import.meta.resolve("@base-ui/react/menu")).resolve(
  "@base-ui/utils/useIsoLayoutEffect",
);
for (const path of [layoutEffectPath, layoutEffectPath.replace(/\.js$/, ".mjs")]) {
  void mock.module(path, () => ({ useIsoLayoutEffect: useLayoutEffect }));
}

const { en } = await import("@/i18n/ui/en");
const { renderIsland } = await import("@/test/render");
const { announceHeaderMenuOpen } = await import("./header-menu-events");
const { ThemeMenu } = await import("./ThemeMenu");
const { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, parseThemeChoice, readStoredTheme } =
  await import("./theme-storage");
await GlobalRegistrator.unregister();

const unavailable = {
  getItem: () => {
    throw new Error("storage unavailable");
  },
};

let unmountIsland: (() => void) | undefined;

function trigger(): HTMLElement {
  const button = document.querySelector<HTMLElement>('[data-menu="theme-button"]');
  if (button === null) throw new Error("no theme button");
  return button;
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Bun.sleep(30);
  });
}

async function openMenu(): Promise<void> {
  await settle(() => {
    trigger().click();
  });
}

function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
}

function itemFor(label: string): HTMLElement {
  const match = items().find((item) => item.textContent === label);
  if (match === undefined) throw new Error(`no ${label} item`);
  return match;
}

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  unmountIsland?.();
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  unmountIsland?.();
  document.body.innerHTML = "";
  localStorage.clear();
  unmountIsland = renderIsland(<ThemeMenu labels={en.theme} />).unmount;
});

describe("theme storage helpers", () => {
  test("parseThemeChoice accepts only the three choices", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("blue")).toBeUndefined();
    expect(parseThemeChoice(null)).toBeUndefined();
  });

  test("readStoredTheme defaults to system and survives a blocked storage", () => {
    expect(readStoredTheme()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "nope");
    expect(readStoredTheme()).toBe("system");
    expect(readStoredTheme({ getItem: () => "dark" })).toBe("dark");
    expect(readStoredTheme(unavailable)).toBe("system");
  });
});

describe("ThemeMenu", () => {
  test("renders the labelled trigger with the three icons and a closed menu", () => {
    expect(trigger().getAttribute("aria-label")).toBe(en.theme.label);
    expect(trigger().querySelectorAll("svg[data-icon]").length).toBe(3);
    expect(items().length).toBe(0);
  });

  test("opens with light, dark and system rows and checks the stored choice", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    await openMenu();
    expect(items().map((item) => item.textContent)).toEqual([
      en.theme.light,
      en.theme.dark,
      en.theme.system,
    ]);
    expect(itemFor(en.theme.dark).getAttribute("aria-checked")).toBe("true");
    expect(itemFor(en.theme.light).getAttribute("aria-checked")).toBe("false");
  });

  test("picking dark stores it, announces it and closes the menu", async () => {
    const announced: unknown[] = [];
    window.addEventListener(THEME_CHANGE_EVENT, (event) => {
      if (event instanceof CustomEvent) announced.push(event.detail);
    });
    await openMenu();
    await settle(() => {
      itemFor(en.theme.dark).click();
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(announced).toEqual(["dark"]);
    expect(items().length).toBe(0);
  });

  test("still announces the choice when storage is blocked", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const announced: unknown[] = [];
    window.addEventListener(THEME_CHANGE_EVENT, (event) => {
      if (event instanceof CustomEvent) announced.push(event.detail);
    });
    await openMenu();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: unavailable.getItem,
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    await settle(() => {
      itemFor(en.theme.light).click();
    });
    if (original !== undefined) Object.defineProperty(globalThis, "localStorage", original);
    expect(announced).toContain("light");
    expect(items().length).toBe(0);
  });

  test("Escape closes the menu and returns focus to the trigger", async () => {
    await openMenu();
    await settle(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(items().length).toBe(0);
    expect(document.activeElement).toBe(trigger());
  });

  test("another header menu opening closes it", async () => {
    await openMenu();
    expect(items().length).toBe(3);
    await settle(() => {
      announceHeaderMenuOpen("language-other");
    });
    expect(items().length).toBe(0);
  });
});
