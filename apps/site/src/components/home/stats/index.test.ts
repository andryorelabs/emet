import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initStats } from "./index";

const MARKUP = `
<section class="stats">
  <canvas data-topo></canvas>
  <dl><div class="stat" data-n="3"><dd class="stat-value"><span class="stat-text">3</span></dd></div></dl>
</section>`;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

let paints = 0;
let frames = 0;

describe("initStats", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    paints = 0;
    frames = 0;
    define("IntersectionObserver", undefined);
    define("ResizeObserver", undefined);
    define(
      "Path2D",
      class {
        moveTo = (): undefined => undefined;
        lineTo = (): undefined => undefined;
      },
    );
    define("requestAnimationFrame", () => {
      frames++;
      return frames;
    });
    const target: Record<string, unknown> = {};
    const context = new Proxy(target, {
      get: (store, key) => {
        if (typeof key !== "string") return undefined;
        if (key === "clearRect") return () => paints++;
        if (key === "measureText") return () => ({ width: 10 });
        return key in store ? store[key] : () => undefined;
      },
      set: (store, key, value) => {
        if (typeof key === "string") store[key] = value;
        return true;
      },
    });
    document.body.innerHTML = MARKUP;
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.getBoundingClientRect = () => new DOMRect(0, 0, 240, 160);
      Object.defineProperty(canvas, "getContext", { value: () => context });
    }
  });

  test("does nothing when the page has no stats band", () => {
    document.body.innerHTML = "";
    expect(() => {
      initStats(document);
    }).not.toThrow();
    expect(frames).toBe(0);
  });

  test("arms the odometer and animates the canvas", () => {
    define("matchMedia", () => ({ matches: false }));
    initStats(document);
    expect(document.querySelector(".stats")?.hasAttribute("data-armed")).toBe(true);
    expect(paints).toBe(1);
    expect(frames).toBe(1);
  });

  test("paints one still frame with reduced motion and keeps the plain numbers", () => {
    define("matchMedia", () => ({ matches: true }));
    initStats(document);
    expect(document.querySelector(".odo")).toBeNull();
    expect(paints).toBe(1);
    expect(frames).toBe(0);
  });

  test("still arms the odometer when the band has no canvas", () => {
    define("matchMedia", () => ({ matches: false }));
    document.querySelector("canvas")?.remove();
    initStats(document);
    expect(document.querySelector(".odo")).not.toBeNull();
    expect(paints).toBe(0);
  });
});
