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

const { LOCALES, LOCALE_NAMES, localePath } = await import("@/i18n/locales");
const { renderIsland } = await import("@/test/render");
const { announceHeaderMenuOpen } = await import("./header-menu-events");
const { LanguageMenu } = await import("./LanguageMenu");
const { ThemeMenu } = await import("./ThemeMenu");
const { en } = await import("@/i18n/ui/en");
await GlobalRegistrator.unregister();

let unmountIsland: (() => void) | undefined;

function trigger(): HTMLElement {
  const button = document.querySelector<HTMLElement>('[data-menu="lang-trigger"]');
  if (button === null) throw new Error("no language trigger");
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

function links(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('[data-menu="lang-menu"] a')];
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
  unmountIsland = renderIsland(
    <>
      <LanguageMenu locale="es" currentPath="/docs/guide/" labels={{ label: "Language" }} />
      <ThemeMenu labels={en.theme} />
    </>,
  ).unmount;
});

describe("LanguageMenu", () => {
  test("the trigger names the menu and the current language", () => {
    expect(trigger().getAttribute("aria-label")).toBe(`Language: ${LOCALE_NAMES.es}`);
    expect(trigger().textContent).toContain(LOCALE_NAMES.es);
    expect(links().length).toBe(0);
  });

  test("lists one link per locale built with localePath, marking the current one", async () => {
    await openMenu();
    expect(links().map((link) => link.getAttribute("href"))).toEqual(
      LOCALES.map((target) => localePath(target, "/docs/guide/")),
    );
    expect(links().map((link) => link.querySelector("span")?.textContent)).toEqual(
      LOCALES.map((target) => LOCALE_NAMES[target]),
    );
    const current = links().filter((link) => link.getAttribute("aria-current") === "true");
    expect(current.map((link) => link.getAttribute("hreflang"))).toEqual(["es"]);
  });

  test("Escape closes the menu and returns focus to the trigger", async () => {
    await openMenu();
    await settle(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(links().length).toBe(0);
    expect(document.activeElement).toBe(trigger());
  });

  test("opening the theme menu closes it", async () => {
    await openMenu();
    expect(links().length).toBe(LOCALES.length);
    await settle(() => {
      document.querySelector<HTMLElement>('[data-menu="theme-button"]')?.click();
    });
    expect(links().length).toBe(0);
    expect(document.querySelectorAll('[role="menuitemradio"]').length).toBe(3);
  });

  test("another header menu opening closes it", async () => {
    await openMenu();
    await settle(() => {
      announceHeaderMenuOpen("mobile-menu", document.body);
    });
    expect(links().length).toBe(0);
  });
});
