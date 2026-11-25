import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { INSTALL_TARGET_KEY } from "./install-target";

const MARKUP = `
<div data-install-tabs data-slot="tabs">
  <div data-slot="tabs-list" role="tablist" hidden></div>
  <div data-slot="tabs-content" data-tab-label="bun"><pre>bun add emet</pre></div>
  <div data-slot="tabs-content" data-tab-label="npm"><pre>npm i emet</pre></div>
</div>`;

beforeAll(async () => {
  GlobalRegistrator.register();
  document.body.innerHTML = MARKUP;
  await import("./install-tabs-client");
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("install tabs client", () => {
  test("builds the tabs with the first one active", () => {
    const tabs = document.querySelectorAll<HTMLElement>("[role=tab]");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.hasAttribute("data-active")).toBe(true);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector<HTMLElement>("[role=tablist]")?.hidden).toBe(false);
  });

  test("picking a tab activates it, shows its panel and remembers the choice", () => {
    const tabs = document.querySelectorAll<HTMLElement>("[role=tab]");
    tabs[1]?.click();
    expect(tabs[1]?.hasAttribute("data-active")).toBe(true);
    expect(tabs[0]?.hasAttribute("data-active")).toBe(false);
    const panels = document.querySelectorAll<HTMLElement>("[data-tab-label]");
    expect(panels[0]?.hidden).toBe(true);
    expect(panels[1]?.hidden).toBe(false);
    expect(localStorage.getItem(INSTALL_TARGET_KEY)).toBe("npm");
  });

  test("arrow keys move to the next tab and remember it", () => {
    const tabs = document.querySelectorAll<HTMLElement>("[role=tab]");
    tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(tabs[0]?.hasAttribute("data-active")).toBe(true);
    expect(localStorage.getItem(INSTALL_TARGET_KEY)).toBe("bun");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(tabs[0]?.hasAttribute("data-active")).toBe(true);
  });

  test("ignores clicks that are not on a tab", () => {
    document.body.click();
    expect(document.querySelectorAll("[data-active]")).toHaveLength(1);
  });
});
