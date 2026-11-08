import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { HEADER_MENU_OPEN_EVENT, initThemeSelects } from "./theme-menu";
import { initHeaderMenus } from "./header-menus";

const MARKUP = `
<div id="outside"></div>
<div class="panel">
  <details class="lang">
    <summary>English</summary>
    <ul><li><a href="/pt-br/">Portugues</a></li></ul>
  </details>
  <div class="theme-select" data-theme-select hidden>
    <button type="button" class="theme-button" aria-haspopup="menu" aria-expanded="false"></button>
    <div class="theme-menu" role="menu" hidden>
      <button type="button" role="menuitemradio" aria-checked="false" data-choice="light"></button>
      <button type="button" role="menuitemradio" aria-checked="false" data-choice="dark"></button>
    </div>
  </div>
</div>`;

function lang(): HTMLDetailsElement {
  const details = document.querySelector<HTMLDetailsElement>("details.lang");
  if (details === null) throw new Error("no language menu");
  return details;
}

function summary(): HTMLElement {
  const element = lang().querySelector<HTMLElement>("summary");
  if (element === null) throw new Error("no summary");
  return element;
}

function themeMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>(".theme-menu");
  if (menu === null) throw new Error("no theme menu");
  return menu;
}

function openLang(): void {
  lang().open = true;
  lang().dispatchEvent(new Event("toggle"));
}

function openTheme(): void {
  document.querySelector<HTMLElement>(".theme-button")?.click();
}

function signalPanelOpening(): void {
  document.dispatchEvent(
    new CustomEvent(HEADER_MENU_OPEN_EVENT, { detail: document.querySelector(".panel") }),
  );
}

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  initThemeSelects();
  initHeaderMenus();
});

describe("header menus", () => {
  test("opening the language menu closes the theme menu", () => {
    openTheme();
    expect(themeMenu().hidden).toBe(false);
    openLang();
    expect(themeMenu().hidden).toBe(true);
    expect(lang().open).toBe(true);
  });

  test("opening the theme menu closes the language menu", () => {
    openLang();
    openTheme();
    expect(lang().open).toBe(false);
    expect(themeMenu().hidden).toBe(false);
  });

  test("a click outside closes the language menu", () => {
    openLang();
    document.querySelector<HTMLElement>("#outside")?.click();
    expect(lang().open).toBe(false);
  });

  test("a click inside keeps the language menu open", () => {
    openLang();
    lang().querySelector<HTMLElement>("a")?.click();
    expect(lang().open).toBe(true);
  });

  test("Escape closes the language menu and focuses the summary", () => {
    openLang();
    lang()
      .querySelector("a")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(lang().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  test("the mobile panel opening closes the language menu", () => {
    openLang();
    signalPanelOpening();
    expect(lang().open).toBe(false);
  });

  test("the mobile panel opening closes the theme menu", () => {
    openTheme();
    signalPanelOpening();
    expect(themeMenu().hidden).toBe(true);
  });

  test("initialising twice does not double bind", () => {
    initHeaderMenus();
    openLang();
    expect(lang().open).toBe(true);
  });
});
