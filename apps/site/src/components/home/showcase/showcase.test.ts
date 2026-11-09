import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";

const MARKUP = `
<section data-showcase data-state="merged">
  <div class="showcase-panel">
    <h2><span data-variant="merged">The wave merges</span><span data-variant="held">The wave waits</span></h2>
    <p data-showcase-status><span data-variant="merged">Merged.</span><span data-variant="held">Held.</span></p>
    <button type="button" aria-pressed="false" data-showcase-flag hidden></button>
  </div>
</section>`;

const VIEWPORT = 800;
const RUNWAY = 2000;

let frames: FrameRequestCallback[] = [];
let runwayTop = 0;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class ImmediateObserver {
  private readonly callback: (entries: unknown[]) => void;
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback([{ target, isIntersecting: true }]);
  }
  unobserve(): void {}
  disconnect(): void {}
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
    define("matchMedia", () => ({
      matches: false,
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

  test("scrolling past 0.55 flags the ticket and keeps the three views in step", () => {
    scrollToProgress(0.6);
    expect(parts()).toEqual({ state: "held", pressed: "true", live: "Held.", hidden: "true" });
  });

  test("the dead band keeps the state, going back under 0.45 unflags it", () => {
    scrollToProgress(0.5);
    expect(parts().state).toBe("held");
    scrollToProgress(0.4);
    expect(parts()).toEqual({ state: "merged", pressed: "false", live: "Merged.", hidden: "true" });
  });

  test("a click flips all three views and holds until the next threshold crossing", () => {
    const control = document.querySelector<HTMLButtonElement>("[data-showcase-flag]");
    if (!control) throw new Error("missing control");
    control.click();
    expect(parts()).toEqual({ state: "held", pressed: "true", live: "Held.", hidden: "true" });
    scrollToProgress(0.3);
    expect(parts().state).toBe("held");
    scrollToProgress(0.6);
    expect(parts().state).toBe("held");
    scrollToProgress(0.3);
    expect(parts()).toEqual({ state: "merged", pressed: "false", live: "Merged.", hidden: "true" });
  });
});

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("showcase frame and feature rows sources", () => {
  const showcaseSource = read("../Showcase.astro");
  const showcaseCss = read("../../../styles/showcase.css");
  const featuresSource = read("../Features.astro");
  const homeCss = read("../../../styles/home.css");

  test("the stage and the panel are siblings inside one frame, and only the frame pins", () => {
    expect(showcaseSource).toMatch(
      /<div class="showcase-frame">\s*<div class="showcase-stage" aria-hidden="true">[\s\S]*<\/div>\s*<div class="showcase-panel">/,
    );
    expect(showcaseCss).toMatch(
      /\[data-pinned\] \.showcase-frame \{\s*position: sticky;\s*top: 0;\s*height: 100svh;/,
    );
    expect(showcaseCss).not.toMatch(/\[data-pinned\] \.showcase-panel/);
  });

  test("features render revealed bento cards and no plate or absolute notes", () => {
    expect(featuresSource).toContain('class="bento"');
    expect(featuresSource).toContain('data-reveal="item"');
    expect(homeCss).not.toMatch(/\.plate|\.note\b/);
  });

  test("the portrait picture clips the drift", () => {
    expect(homeCss).toMatch(/\.portrait picture \{\s*overflow: clip;/);
  });
});
