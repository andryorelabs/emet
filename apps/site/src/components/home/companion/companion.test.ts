import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initCompanion } from "./companion";

const MARKUP = `
<section class="hero" id="hero-fixture"></section>
<section id="how"></section>
<div data-companion data-state="sleep" data-sleep="Zzz" data-work="Working" data-wait="Waiting" data-done="Done" hidden>
  <p data-companion-say role="status"></p>
  <a data-companion-docs href="/docs/" hidden>Docs</a>
  <div data-companion-menu role="menu" hidden>
    <button role="menuitem" data-answer="A0">Q0</button>
    <button role="menuitem" data-answer="A1">Q1</button>
    <button role="menuitem" data-answer="A2">Q2</button>
    <button role="menuitem" data-answer="A3">Q3</button>
  </div>
  <button data-companion-button aria-expanded="false"></button>
</div>`;

let reduced = false;

beforeAll(() => {
  GlobalRegistrator.register();
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: reduced && query.includes("reduce") }),
  });
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

/**
 * A bounding-rectangle reader for a section spanning two y coordinates.
 */
function rect(top: number, bottom: number): () => DOMRect {
  return () => new DOMRect(0, top, 72, bottom - top);
}

/**
 * Presses a key on the document.
 */
function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/**
 * The index of the focused element among the items, or -1.
 */
function focusedIndex(items: readonly HTMLElement[]): number {
  return items.findIndex((item) => item === document.activeElement);
}

/**
 * Places the sections: the hero and How it works get the given tops.
 */
function layout(position: "hero" | "how"): void {
  const hero = document.querySelector<HTMLElement>(".hero");
  const how = document.querySelector<HTMLElement>("#how");
  if (!hero || !how) throw new Error("fixture");
  hero.getBoundingClientRect = position === "hero" ? rect(-100, 900) : rect(-1000, 0);
  how.getBoundingClientRect = position === "hero" ? rect(900, 1800) : rect(0, 1800);
}

/**
 * Mounts the fixture and returns its parts.
 */
function mount(position: "hero" | "how" = "how") {
  document.body.innerHTML = MARKUP;
  layout(position);
  const root = document.querySelector<HTMLElement>("[data-companion]");
  const button = document.querySelector<HTMLButtonElement>("[data-companion-button]");
  const menu = document.querySelector<HTMLElement>("[data-companion-menu]");
  const say = document.querySelector<HTMLElement>("[data-companion-say]");
  const docs = document.querySelector<HTMLElement>("[data-companion-docs]");
  if (!root || !button || !menu || !say || !docs) throw new Error("fixture");
  const handle = initCompanion(root);
  return { root, button, menu, say, docs, handle };
}

/**
 * Waits for the scheduled measure.
 */
async function frame(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

beforeEach(() => {
  reduced = false;
});

describe("initCompanion", () => {
  test("shows the state for the section in view", () => {
    const { root, say, handle } = mount("how");
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe("work");
    expect(say.textContent).toBe("Working");
    expect("away" in root.dataset).toBe(false);
    handle.destroy();
  });

  test("hides and sleeps over the hero", () => {
    const { root, say, handle } = mount("hero");
    expect(root.dataset.state).toBe("sleep");
    expect(say.textContent).toBe("Zzz");
    expect("away" in root.dataset).toBe(true);
    expect(root.inert).toBe(true);
    handle.destroy();
  });

  test("hides near the footer, returns when it scrolls away and follows resizes", async () => {
    document.body.innerHTML = `<footer class="site-footer"></footer>${MARKUP}`;
    layout("how");
    const footer = document.querySelector<HTMLElement>(".site-footer");
    const root = document.querySelector<HTMLElement>("[data-companion]");
    if (!footer || !root) throw new Error("fixture");
    const viewport = globalThis.innerHeight;
    footer.getBoundingClientRect = rect(viewport - 200, viewport + 400);
    const handle = initCompanion(root);
    expect("away" in root.dataset).toBe(true);
    expect(root.inert).toBe(true);
    footer.getBoundingClientRect = rect(viewport - 100, viewport + 500);
    globalThis.dispatchEvent(new Event("scroll"));
    await frame();
    expect("away" in root.dataset).toBe(true);
    footer.getBoundingClientRect = rect(viewport, viewport + 600);
    globalThis.dispatchEvent(new Event("scroll"));
    await frame();
    expect("away" in root.dataset).toBe(false);
    expect(root.inert).toBe(false);
    footer.getBoundingClientRect = rect(viewport - 1, viewport + 600);
    globalThis.dispatchEvent(new Event("resize"));
    await frame();
    expect("away" in root.dataset).toBe(true);
    handle.destroy();
  });

  test("re-measures on scroll", async () => {
    const { root, handle } = mount("hero");
    layout("how");
    globalThis.dispatchEvent(new Event("scroll"));
    globalThis.dispatchEvent(new Event("scroll"));
    await frame();
    expect(root.dataset.state).toBe("work");
    handle.destroy();
  });

  test("reacts to the section events and falls back after a while", async () => {
    const { root, say, handle } = mount("how");
    globalThis.dispatchEvent(new CustomEvent("emet:flag-toggle", { detail: { held: true } }));
    expect(root.dataset.state).toBe("wait");
    expect(say.textContent).toBe("Waiting");
    globalThis.dispatchEvent(new CustomEvent("emet:flag-toggle", { detail: null }));
    expect(root.dataset.state).toBe("work");
    globalThis.dispatchEvent(new Event("emet:flag-toggle"));
    expect(root.dataset.state).toBe("work");
    globalThis.dispatchEvent(new CustomEvent("emet:copy"));
    expect(root.dataset.state).toBe("done");
    globalThis.dispatchEvent(new CustomEvent("emet:approval-hold"));
    expect(root.dataset.state).toBe("done");
    await new Promise((resolve) => setTimeout(resolve, 2700));
    expect(root.dataset.state).toBe("work");
    handle.destroy();
  });

  test("falls asleep after the idle delay and wakes on a pointer move", async () => {
    document.body.innerHTML = MARKUP;
    layout("how");
    const root = document.querySelector<HTMLElement>("[data-companion]");
    if (!root) throw new Error("fixture");
    const handle = initCompanion(root, 40);
    expect(root.dataset.state).toBe("work");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(root.dataset.state).toBe("sleep");
    globalThis.dispatchEvent(new Event("pointermove"));
    expect(root.dataset.state).toBe("work");
    handle.destroy();
  });

  test("never sleeps under reduced motion", async () => {
    reduced = true;
    document.body.innerHTML = MARKUP;
    layout("how");
    const root = document.querySelector<HTMLElement>("[data-companion]");
    if (!root) throw new Error("fixture");
    const handle = initCompanion(root, 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(root.dataset.state).toBe("work");
    handle.destroy();
  });

  test("follows the How it works step and the Showcase hold", async () => {
    const { root, handle } = mount("how");
    const how = document.querySelector<HTMLElement>("#how");
    if (!how) throw new Error("fixture");
    how.dataset.step = "1";
    await frame();
    expect(root.dataset.state).toBe("wait");
    how.dataset.step = "2";
    await frame();
    expect(root.dataset.state).toBe("done");
    handle.destroy();
  });

  test("waits while the Showcase is held by scroll", async () => {
    document.body.innerHTML = `${MARKUP}<section id="showcase" data-state="merged"></section>`;
    const showcase = document.querySelector<HTMLElement>("#showcase");
    const how = document.querySelector<HTMLElement>("#how");
    const hero = document.querySelector<HTMLElement>(".hero");
    const root = document.querySelector<HTMLElement>("[data-companion]");
    if (!showcase || !how || !hero || !root) throw new Error("fixture");
    hero.getBoundingClientRect = rect(-1000, -500);
    how.getBoundingClientRect = rect(-500, 0);
    showcase.getBoundingClientRect = rect(0, 2000);
    const handle = initCompanion(root);
    expect(root.dataset.state).toBe("work");
    showcase.dataset.state = "held";
    await frame();
    expect(root.dataset.state).toBe("wait");
    handle.destroy();
  });

  test("opens the menu on click and focuses the first item", () => {
    const { button, menu, handle } = mount();
    button.click();
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(menu.querySelector("button"));
    button.click();
    expect(menu.hidden).toBe(true);
    handle.destroy();
  });

  test("moves focus with arrows, Home and End and ignores other keys", () => {
    const { button, menu, handle } = mount();
    button.click();
    const items = [...menu.querySelectorAll<HTMLElement>("button")];
    press("ArrowDown");
    expect(focusedIndex(items)).toBe(1);
    press("ArrowUp");
    expect(focusedIndex(items)).toBe(0);
    press("End");
    expect(focusedIndex(items)).toBe(3);
    press("x");
    expect(focusedIndex(items)).toBe(3);
    handle.destroy();
  });

  test("closes on Escape and returns focus, and ignores keys while closed", () => {
    const { button, menu, handle } = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    button.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    handle.destroy();
  });

  test("closes on an outside press but not on an inside one", () => {
    const { button, menu, handle } = mount();
    button.click();
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.hidden).toBe(false);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.hidden).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    handle.destroy();
  });

  test("closes when focus leaves the companion", () => {
    const { root, button, menu, handle } = mount();
    button.click();
    root.dispatchEvent(new FocusEvent("focusout", { relatedTarget: document.body }));
    expect(menu.hidden).toBe(true);
    root.dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    button.click();
    root.dispatchEvent(new FocusEvent("focusout", { relatedTarget: button }));
    expect(menu.hidden).toBe(false);
    handle.destroy();
  });

  test("answers a question and offers the docs link for the last one", () => {
    const { button, menu, say, docs, root, handle } = mount();
    button.click();
    menu.querySelectorAll<HTMLElement>("button")[0]?.click();
    expect(say.textContent).toBe("A0");
    expect(docs.hidden).toBe(true);
    expect(menu.hidden).toBe(true);
    button.click();
    menu.querySelectorAll<HTMLElement>("button")[3]?.click();
    expect(say.textContent).toBe("A3");
    expect(docs.hidden).toBe(false);
    expect(root.dataset.state).toBe("work");
    handle.destroy();
  });

  test("clears the answer after its delay", async () => {
    const { button, menu, say, handle } = mount();
    button.click();
    menu.querySelectorAll<HTMLElement>("button")[1]?.click();
    await new Promise((resolve) => setTimeout(resolve, 6600));
    expect(say.textContent).toBe("Working");
    handle.destroy();
  }, 10_000);

  test("closes the menu when the golem goes back over the hero", async () => {
    const { button, menu, handle } = mount();
    button.click();
    layout("hero");
    globalThis.dispatchEvent(new Event("resize"));
    await frame();
    expect(menu.hidden).toBe(true);
    handle.destroy();
  });

  test("follows the pointer with its eyes", () => {
    const { root, handle } = mount();
    globalThis.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: -200 }));
    expect(root.style.getPropertyValue("--eye-x")).toBe("0.50");
    expect(root.style.getPropertyValue("--eye-y")).toBe("-0.50");
    handle.destroy();
  });

  test("drags with capture, springs back and swallows the click", async () => {
    const { root, button, menu, handle } = mount();
    let captured = -1;
    button.setPointerCapture = (id: number): void => {
      captured = id;
    };
    const fire = (type: string, x: number, y: number): void => {
      button.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
    };
    const withId = (type: string, x: number, y: number): void => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 7 });
      button.dispatchEvent(event);
    };
    fire("pointermove", 5, 5);
    fire("pointerup", 5, 5);
    withId("pointerdown", 100, 100);
    withId("pointerdown", 100, 100);
    expect(captured).toBe(7);
    fire("pointermove", 102, 102);
    expect(root.style.getPropertyValue("--companion-dx")).toBe("");
    fire("pointermove", 60, 70);
    expect(root.style.getPropertyValue("--companion-dx")).toBe("0px");
    fire("pointerup", 60, 70);
    expect("back" in root.dataset).toBe(true);
    expect(root.style.getPropertyValue("--companion-dy")).toBe("0px");
    button.click();
    expect(menu.hidden).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    button.click();
    expect(menu.hidden).toBe(false);
    withId("pointerdown", 10, 10);
    fire("pointerup", 10, 10);
    withId("pointerdown", 10, 10);
    fire("pointercancel", 10, 10);
    expect("back" in root.dataset).toBe(false);
    handle.destroy();
  });

  test("under reduced motion the eyes stay still and nothing drags", () => {
    reduced = true;
    const { root, button, handle } = mount();
    globalThis.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 200 }));
    expect(root.style.getPropertyValue("--eye-x")).toBe("");
    button.dispatchEvent(new MouseEvent("pointerdown", { clientX: 1, clientY: 1, bubbles: true }));
    button.dispatchEvent(
      new MouseEvent("pointermove", { clientX: -90, clientY: -90, bubbles: true }),
    );
    expect(root.style.getPropertyValue("--companion-dx")).toBe("");
    handle.destroy();
  });

  test("does nothing without its parts and stops listening once destroyed", () => {
    document.body.innerHTML = `<div data-companion hidden></div>`;
    const bare = document.querySelector<HTMLElement>("[data-companion]");
    if (!bare) throw new Error("fixture");
    initCompanion(bare).destroy();
    expect(bare.hidden).toBe(true);
    const { root, handle } = mount();
    handle.destroy();
    globalThis.dispatchEvent(new CustomEvent("emet:copy"));
    expect(root.dataset.state).toBe("work");
  });
});
