import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, useLayoutEffect } from "react";

import { renderIsland } from "../../test/render";
import { announceHeaderMenuOpen } from "./header-menu-events";
import type { MobileMenuLink } from "./MobileMenu";

GlobalRegistrator.register();
const dialogEntry = Bun.resolveSync("@base-ui/react/dialog", import.meta.dir);
await mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", dialogEntry), () => ({
  useIsoLayoutEffect: useLayoutEffect,
}));
const { MobileMenu } = await import("./MobileMenu");

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const LINKS: MobileMenuLink[] = [
  { href: "/docs/", label: "Docs", current: true, external: false },
  {
    href: "https://github.com/andryorelabs/emet",
    label: "GitHub",
    current: false,
    external: true,
    stars: { count: "1.2k", tooltip: "1,234 stars", template: "{count} stars" },
  },
];
const LABELS = { menu: "Menu", navigation: "Main", newTab: "(opens in a new tab)" };

function mount() {
  return renderIsland(
    <MobileMenu links={LINKS} locale="en" labels={LABELS}>
      <p data-controls>controls</p>
    </MobileMenu>,
  );
}

function trigger(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("[data-menu-button]");
  if (button === null) throw new Error("no trigger");
  return button;
}

function sheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
}

async function tap(target: Element): Promise<void> {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 }));
    }
    await settle();
  });
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

async function press(target: Element, key: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await settle();
  });
}

describe("MobileMenu", () => {
  test("renders a closed trigger with the menu label", () => {
    const { unmount } = mount();
    expect(trigger().getAttribute("aria-label")).toBe("Menu");
    expect(sheet()).toBeNull();
    unmount();
  });

  test("opens a sheet with the links and the slotted controls", async () => {
    const { unmount } = mount();
    await tap(trigger());
    const content = sheet();
    expect(content?.getAttribute("data-side")).toBe("top");
    const anchors = [...(content?.querySelectorAll("nav a") ?? [])];
    expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
      "/docs/",
      "https://github.com/andryorelabs/emet",
    ]);
    expect(anchors[0]?.getAttribute("aria-current")).toBe("page");
    expect(anchors[1]?.getAttribute("target")).toBe("_blank");
    expect(content?.querySelector("[data-github-stars]")?.textContent).toBe("1.2k");
    expect(content?.querySelector("[data-controls]")).not.toBeNull();
    unmount();
  });

  test("closes when another header menu opens", async () => {
    const { unmount } = mount();
    await tap(trigger());
    expect(sheet()).not.toBeNull();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await act(async () => {
      announceHeaderMenuOpen("theme-1");
      await settle();
    });
    expect(sheet()).toBeNull();
    unmount();
  });

  test("stays open when a control inside the sheet opens its own menu", async () => {
    const { unmount } = mount();
    await tap(trigger());
    const control = document.querySelector<HTMLElement>("[data-controls]");
    if (control === null) throw new Error("no controls");
    control.tabIndex = 0;
    control.focus();
    await act(async () => {
      announceHeaderMenuOpen("theme-1");
      await settle();
    });
    expect(sheet()).not.toBeNull();
    unmount();
  });

  test("closes on Escape", async () => {
    const { unmount } = mount();
    await tap(trigger());
    const content = sheet();
    if (content === null) throw new Error("sheet did not open");
    await press(content, "Escape");
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    unmount();
  });

  test("closes when a link is chosen", async () => {
    const { unmount } = mount();
    await tap(trigger());
    const link = sheet()?.querySelector<HTMLAnchorElement>("nav a");
    link?.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await act(async () => {
      link?.click();
      await settle();
    });
    expect(sheet()).toBeNull();
    unmount();
  });
});
