import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const MARKUP = `
<section data-showcase data-state="merged">
  <div class="showcase-panel">
    <canvas data-showcase-lanes></canvas>
    <h2><span data-variant="merged">The wave merges</span><span data-variant="held">The wave waits</span></h2>
    <p data-showcase-status><span data-variant="merged">Merged.</span><span data-variant="held">Held.</span></p>
    <button type="button" aria-pressed="false" data-showcase-flag hidden></button>
  </div>
</section>`;

const VIEWPORT = 800;
const RUNWAY = 2000;

let frames: FrameRequestCallback[] = [];
let runwayTop = 0;
let observerCallback: ((entries: unknown[]) => void) | undefined;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class ImmediateObserver {
  readonly callback: (entries: unknown[]) => void;
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
    observerCallback = callback;
  }
  observe(target: Element): void {
    this.callback([{ target, isIntersecting: true }]);
  }
  readonly unobserved: Element[] = [];
  disconnected = false;
  unobserve(target: Element): void {
    this.unobserved.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

function scrollToProgress(progress: number): void {
  runwayTop = -progress * (RUNWAY - VIEWPORT);
  globalThis.dispatchEvent(new Event("scroll"));
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

function parts(): {
  state: string | undefined;
  pressed: string | null;
  live: string;
  hidden: string | null;
} {
  const root = document.querySelector<HTMLElement>("[data-showcase]");
  const control = document.querySelector("[data-showcase-flag]");
  const live = document.querySelector('[role="status"]');
  const status = document.querySelector("[data-showcase-status]");
  if (!root || !control || !live || !status) throw new Error("showcase not mounted");
  return {
    state: root.dataset.state,
    pressed: control.getAttribute("aria-pressed"),
    live: live.textContent.trim(),
    hidden: status.getAttribute("aria-hidden"),
  };
}

describe("showcase DOM sync", () => {
  beforeAll(async () => {
    GlobalRegistrator.register();
    document.body.innerHTML = MARKUP;
    define("CSS", { supports: () => true });
    define("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      addEventListener: () => undefined,
    }));
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    define("requestIdleCallback", () => 0);
    define("IntersectionObserver", ImmediateObserver);
    Object.defineProperty(globalThis, "innerHeight", { value: VIEWPORT, configurable: true });
    const root = document.querySelector<HTMLElement>("[data-showcase]");
    if (!root) throw new Error("missing root");
    root.getBoundingClientRect = () => new DOMRect(0, runwayTop, 0, RUNWAY);
    await import("./showcase");
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  test("starts merged with the visible status hidden from assistive tech", () => {
    expect(parts()).toEqual({
      state: "merged",
      pressed: "false",
      live: "Merged.",
      hidden: "true",
    });
  });

  test("the live region sits outside the panel that goes inert", () => {
    const live = document.querySelector('[role="status"]');
    expect(live?.closest(".showcase-panel")).toBeNull();
  });

  test("scrolling past 0.74 flags the ticket and keeps the three views in step", () => {
    scrollToProgress(0.8);
    expect(parts()).toEqual({ state: "held", pressed: "true", live: "Held.", hidden: "true" });
  });

  test("scroll grows the frame and shows the panel from 70%", () => {
    const root = document.querySelector<HTMLElement>("[data-showcase]");
    const panel = document.querySelector<HTMLElement>(".showcase-panel");
    scrollToProgress(0.2);
    expect(Number(root?.style.getPropertyValue("--showcase-x"))).toBeCloseTo(9);
    expect(root?.style.getPropertyValue("--showcase-panel")).toBe("0");
    expect(panel?.inert).toBe(true);
    scrollToProgress(0.8);
    expect(root?.style.getPropertyValue("--showcase-x")).toBe("0");
    expect(root?.style.getPropertyValue("--showcase-panel")).toBe("1");
    expect(panel?.inert).toBe(false);
  });

  test("the dead band keeps the state, going back under 0.66 unflags it", () => {
    scrollToProgress(0.7);
    expect(parts().state).toBe("held");
    scrollToProgress(0.4);
    expect(parts()).toEqual({ state: "merged", pressed: "false", live: "Merged.", hidden: "true" });
  });

  test("a click flips all three views and holds until the section leaves the viewport", () => {
    const control = document.querySelector<HTMLButtonElement>("[data-showcase-flag]");
    if (!control) throw new Error("missing control");
    control.click();
    expect(parts()).toEqual({ state: "held", pressed: "true", live: "Held.", hidden: "true" });
    scrollToProgress(0.3);
    expect(parts().state).toBe("held");
    scrollToProgress(0.8);
    expect(parts().state).toBe("held");
    scrollToProgress(0.3);
    expect(parts().state).toBe("held");
    observerCallback?.([{ target: document.body, isIntersecting: false }]);
    observerCallback?.([{ target: document.body, isIntersecting: true }]);
    scrollToProgress(0.3);
    expect(parts()).toEqual({ state: "merged", pressed: "false", live: "Merged.", hidden: "true" });
  });
});

const DUSK_MARKUP = `
<section data-showcase data-state="merged">
  <img data-srcset="dusk.avif 1x" data-sizes="50vw" alt="">
  <div class="showcase-panel"><canvas data-showcase-lanes></canvas></div>
  <p data-showcase-status><span data-variant="merged">Merged.</span><span data-variant="held">Held.</span></p>
  <button type="button" aria-pressed="false" data-showcase-flag hidden></button>
</section>`;

describe("showcase without idle callbacks and with reduced motion", () => {
  const timeouts: { callback: () => void; delay: number | undefined }[] = [];
  const changeListeners: (() => void)[] = [];
  const motion = { matches: true };
  const viewport = { wide: true };
  const originalSetTimeout = globalThis.setTimeout;

  beforeAll(async () => {
    GlobalRegistrator.register();
    document.body.innerHTML = DUSK_MARKUP;
    const surface = new Proxy({}, { get: () => () => undefined, set: () => true });
    const canvas = document.querySelector("canvas");
    if (canvas) Object.defineProperty(canvas, "getContext", { value: () => surface });
    define("CSS", { supports: () => true });
    define("matchMedia", (query: string) => ({
      get matches() {
        return query.includes("min-width") ? viewport.wide : motion.matches;
      },
      addEventListener: (_type: string, listener: () => void) => {
        changeListeners.push(listener);
      },
    }));
    define("requestAnimationFrame", () => 1);
    define("IntersectionObserver", ImmediateObserver);
    Reflect.deleteProperty(globalThis, "requestIdleCallback");
    define("setTimeout", (callback: () => void, delay?: number) => {
      timeouts.push({ callback, delay });
      return 0;
    });
    const root = document.querySelector<HTMLElement>("[data-showcase]");
    if (!root) throw new Error("missing root");
    root.getBoundingClientRect = () => new DOMRect(0, 0, 0, RUNWAY);
    const specifier = "./showcase?no-idle";
    await import(specifier);
  });

  afterAll(async () => {
    define("setTimeout", originalSetTimeout);
    await GlobalRegistrator.unregister();
  });

  test("falls back to a two second timeout that loads the dusk painting", () => {
    const dusk = document.querySelector<HTMLImageElement>("img[data-srcset]");
    expect(timeouts.map(({ delay }) => delay)).toEqual([2000]);
    expect(dusk?.srcset).toBeFalsy();
    timeouts[0]?.callback();
    expect(dusk?.srcset).toBe("dusk.avif 1x");
    expect(dusk?.sizes).toBe("50vw");
  });

  test("does not pin under reduced motion and pins once it is allowed", () => {
    const root = document.querySelector<HTMLElement>("[data-showcase]");
    expect(root && "pinned" in root.dataset).toBe(false);
    motion.matches = false;
    for (const listener of changeListeners) listener();
    expect(root && "pinned" in root.dataset).toBe(true);
    motion.matches = true;
    for (const listener of changeListeners) listener();
    expect(root && "pinned" in root.dataset).toBe(false);
  });

  test("does not pin below 901px and clears the grow properties", () => {
    const root = document.querySelector<HTMLElement>("[data-showcase]");
    motion.matches = false;
    root?.style.setProperty("--showcase-x", "9");
    const panel = document.querySelector<HTMLElement>(".showcase-panel");
    if (panel) panel.inert = true;
    viewport.wide = false;
    for (const listener of changeListeners) listener();
    expect(root && "pinned" in root.dataset).toBe(false);
    expect(root?.style.getPropertyValue("--showcase-x")).toBe("");
    expect(panel?.inert).toBe(false);
    viewport.wide = true;
    motion.matches = true;
  });
});

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("showcase frame and feature rows sources", () => {
  const showcaseSource = read("../Showcase.astro");
  const showcaseCss = read("../../../styles/showcase.css");
  const featuresSource = read("../Features.astro");
  const featuresCss = read("../../../styles/home/features.css");

  test("the stage, marks, heading and panel are siblings inside one frame, and only the frame pins", () => {
    expect(showcaseSource).toMatch(
      /<div class="showcase-frame">\s*<div class="showcase-stage" aria-hidden="true">[\s\S]*<\/div>\s*<div class="showcase-marks" aria-hidden="true">[\s\S]*<h2 id="showcase-title"[\s\S]*<div class="showcase-panel">/,
    );
    expect(showcaseSource).toContain("data-showcase-lanes");
    expect(showcaseCss).toMatch(
      /\[data-pinned\] \.showcase-frame \{\s*position: sticky;\s*top: 0;\s*height: 100svh;/,
    );
    expect(showcaseCss).toMatch(
      /@media \(min-width: 901px\) \{\s*section\.showcase\[data-pinned\] \{[^}]*height: 340svh;/,
    );
  });

  test("features render revealed bento cards and no plate or absolute notes", () => {
    expect(featuresSource).toContain('class="bento"');
    expect(featuresSource).toContain('data-reveal="item"');
    expect(featuresCss).not.toMatch(/\.plate|\.note\b/);
  });
});
