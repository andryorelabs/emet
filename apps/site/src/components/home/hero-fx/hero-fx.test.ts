import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { coverGeometry } from "../graphics/painting-fx";
import { applyCursorLight, easePoint } from "./cursor-light";
import {
  clampHomes,
  createFireflies,
  drawFireflies,
  fireflyAlpha,
  FIREFLY_AVOID_RADIUS,
  stepFirefly,
} from "./fireflies";
import type { Firefly } from "./fireflies";
import {
  BUBBLE_VISIBLE_MS,
  bubblePlacement,
  golemPlacement,
  initGolemHotspot,
  nextPhrase,
} from "./golem-hotspot";
import { gazeOf, heroFxEnabled, initHeroFx, readPhrases } from "./index";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const resting: Firefly = { homeX: 200, homeY: 200, x: 200, y: 200, vx: 0, vy: 0, phase: 0 };

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

describe("stepFirefly", () => {
  test("moves away from a pointer inside 80 px", () => {
    let fly = resting;
    const pointer: [number, number] = [170, 200];
    const before = Math.hypot(fly.x - pointer[0], fly.y - pointer[1]);
    for (let index = 0; index < 5; index++) fly = stepFirefly(fly, pointer, 16, index * 16);
    expect(Math.hypot(fly.x - pointer[0], fly.y - pointer[1])).toBeGreaterThan(before + 5);
    expect(fly.x).toBeGreaterThan(resting.x);
  });

  test("ignores a pointer beyond the radius, a coincident one and no pointer", () => {
    const far = stepFirefly(resting, [200 + FIREFLY_AVOID_RADIUS + 1, 200], 16, 0);
    const none = stepFirefly(resting, null, 16, 0);
    const same = stepFirefly(resting, [200, 200], 16, 0);
    expect(far).toEqual(none);
    expect(same).toEqual(none);
  });

  test("springs back toward its home point", () => {
    const away: Firefly = { ...resting, x: 300, y: 300 };
    const next = stepFirefly(away, null, 16, 0);
    expect(Math.hypot(next.x - 200, next.y - 200)).toBeLessThan(Math.hypot(100, 100));
  });
});

describe("firefly helpers", () => {
  test("createFireflies scatters the count over the lower part", () => {
    const flies = createFireflies(6, { width: 1000, height: 500 }, () => 0.5);
    expect(flies).toHaveLength(6);
    expect(flies[0]?.homeX).toBeCloseTo(500);
    expect(flies[0]?.homeY).toBeCloseTo(315);
    expect(flies[0]?.x).toBe(flies[0]?.homeX);
  });

  test("alpha stays between 0.35 and 1", () => {
    for (let time = 0; time < 4000; time += 250) {
      const alpha = fireflyAlpha(resting, time);
      expect(alpha).toBeGreaterThanOrEqual(0.35);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  test("clampHomes pulls homes into a smaller host", () => {
    const [clamped] = clampHomes([{ ...resting, homeX: 900, homeY: 700 }], {
      width: 400,
      height: 300,
    });
    expect(clamped?.homeX).toBe(400);
    expect(clamped?.homeY).toBe(300);
  });

  test("drawFireflies paints one glow per firefly", () => {
    const stops: number[] = [];
    let fills = 0;
    const context = {
      fillStyle: "",
      createRadialGradient: () => ({ addColorStop: (offset: number) => stops.push(offset) }),
      fillRect: () => {
        fills += 1;
      },
    };
    drawFireflies(context, [resting, resting], 0);
    expect(fills).toBe(2);
    expect(stops).toEqual([0, 0.35, 1, 0, 0.35, 1]);
  });
});

describe("cursor light", () => {
  test("eases a tenth of the way by default", () => {
    expect(easePoint([0, 0], [100, 50])).toEqual([10, 5]);
    expect(easePoint([0, 0], [100, 50], 0.5)).toEqual([50, 25]);
  });

  test("writes the position and toggles the on marker", () => {
    const light = document.createElement("div");
    applyCursorLight(light, [12.34, 56.78], true);
    expect(light.style.getPropertyValue("--mx")).toBe("12.3px");
    expect(light.style.getPropertyValue("--my")).toBe("56.8px");
    expect(light.dataset.on).toBe("");
    applyCursorLight(light, [0, 0], false);
    expect(light.dataset.on).toBeUndefined();
  });
});

describe("golem hotspot placement", () => {
  const image = { width: 1672, height: 941 };

  test("centres on the golem as object-fit cover draws it", () => {
    const box = { width: 1440, height: 900 };
    const rect = golemPlacement(image, box, [0.5, 1], [1385, 690]);
    const { scale, offsetX, offsetY } = coverGeometry(image, box, [0.5, 1]);
    expect(rect.x + 32).toBeCloseTo(offsetX + 1385 * scale);
    expect(rect.y + 32).toBeCloseTo(offsetY + 690 * scale);
    expect(rect.width).toBe(64);
    expect(rect.height).toBe(64);
  });

  test("stays 32 px inside the sides", () => {
    const rect = golemPlacement(image, { width: 600, height: 900 }, [0.5, 1], [1385, 690]);
    expect(rect.x + 32).toBeLessThanOrEqual(600 - 32);
    const left = golemPlacement(image, { width: 600, height: 900 }, [0.5, 1], [0, 690]);
    expect(left.x).toBe(0);
  });

  test("places the bubble above and inside the host", () => {
    expect(bubblePlacement({ x: 500, y: 400, width: 64, height: 64 }, 1440)).toEqual([422, 346]);
    expect(bubblePlacement({ x: 1380, y: 400, width: 64, height: 64 }, 1440)[0]).toBe(1204);
  });

  test("cycles through four phrases", () => {
    expect([0, 1, 2, 3].map(nextPhrase)).toEqual([1, 2, 3, 0]);
  });
});

describe("gazeOf", () => {
  test("follows the eased pointer only while inside", () => {
    const state = {
      target: [0, 0] as [number, number],
      eased: [4, 9] as [number, number],
      inside: true,
    };
    expect(gazeOf(state)).toEqual({ x: 4, y: 9 });
    expect(gazeOf({ ...state, inside: false })).toBeNull();
  });
});

describe("heroFxEnabled and readPhrases", () => {
  const base = { reducedMotion: false, viewportWidth: 1440, coarsePointer: false };

  test("runs only for wide, fine-pointer, motion-tolerant viewers", () => {
    expect(heroFxEnabled(base)).toBe(true);
    expect(heroFxEnabled({ ...base, reducedMotion: true })).toBe(false);
    expect(heroFxEnabled({ ...base, viewportWidth: 900 })).toBe(false);
    expect(heroFxEnabled({ ...base, coarsePointer: true })).toBe(false);
  });

  test("reads a JSON list of strings and tolerates bad input", () => {
    expect(readPhrases('["a","b"]')).toEqual(["a", "b"]);
    expect(readPhrases('["a",1]')).toEqual(["a"]);
    expect(readPhrases("{}")).toEqual([]);
    expect(readPhrases("not json")).toEqual([]);
    expect(readPhrases(undefined)).toEqual([]);
  });
});

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let observerCallback: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
let tabHidden = false;
let reduced = false;
let width = 1440;
let clears = 0;

class FakeObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    observerCallback = callback;
  }
  observe(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
}

function runFrame(time: number): void {
  const pending = [...frames.values()];
  frames = new Map();
  for (const callback of pending) callback(time);
}

function buildHero(withContext = true): HTMLElement {
  document.body.innerHTML = `<section class="hero"><picture><img alt=""></picture>
    <canvas data-hero-fireflies hidden></canvas><div data-hero-light hidden></div>
    <button data-hero-golem hidden></button><p data-hero-bubble></p></section>`;
  const hero = document.querySelector<HTMLElement>(".hero");
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  if (!hero || !canvas) throw new Error("fixture missing");
  hero.dataset.phrases = '["one","two","three","four"]';
  Object.defineProperty(hero, "clientWidth", { value: 1440, configurable: true });
  Object.defineProperty(hero, "clientHeight", { value: 900, configurable: true });
  const context = {
    setTransform: () => undefined,
    clearRect: () => {
      clears += 1;
    },
    fillRect: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  Object.defineProperty(canvas, "getContext", { value: () => (withContext ? context : null) });
  return hero;
}

describe("initHeroFx", () => {
  const started: { destroy(): void }[] = [];

  beforeAll(() => {
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    define("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    define("IntersectionObserver", FakeObserver);
    define("matchMedia", (query: string) => ({
      matches: query.includes("reduce") ? reduced : false,
    }));
    define("innerWidth", 1440);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => tabHidden });
  });

  afterEach(() => {
    for (const handle of started.splice(0)) handle.destroy();
    reduced = false;
    width = 1440;
    define("innerWidth", width);
    tabHidden = false;
    clears = 0;
    frames = new Map();
  });

  function start(hero: HTMLElement): { destroy(): void } {
    const handle = initHeroFx(hero);
    started.push(handle);
    return handle;
  }

  test("does nothing under reduced motion and leaves the hotspot hidden", () => {
    reduced = true;
    const hero = buildHero();
    start(hero);
    expect(hero.querySelector<HTMLElement>("[data-hero-golem]")?.hidden).toBe(true);
    expect(frames.size).toBe(0);
  });

  test("does nothing on small screens, without markup or without a 2D context", () => {
    define("innerWidth", 600);
    start(buildHero());
    expect(document.querySelector<HTMLElement>("[data-hero-golem]")?.hidden).toBe(true);
    define("innerWidth", 1440);
    start(buildHero(false));
    expect(document.querySelector<HTMLElement>("[data-hero-golem]")?.hidden).toBe(true);
    const empty = document.createElement("section");
    expect(() => start(empty)).not.toThrow();
  });

  test("shows the layers, places the hotspot and loops only while visible", () => {
    const hero = buildHero();
    start(hero);
    const button = hero.querySelector<HTMLElement>("[data-hero-golem]");
    expect(button?.hidden).toBe(false);
    expect(button?.style.getPropertyValue("width")).toBe("64px");
    expect(frames.size).toBe(0);
    observerCallback([{ isIntersecting: true }]);
    expect(frames.size).toBe(1);
    runFrame(100);
    expect(clears).toBe(1);
    expect(frames.size).toBe(1);
    tabHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    tabHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(1);
    observerCallback([{ isIntersecting: false }]);
    expect(frames.size).toBe(0);
  });

  test("lights the cursor light while the pointer is over the hero", () => {
    const hero = buildHero();
    start(hero);
    observerCallback([{ isIntersecting: true }]);
    hero.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 400 }));
    runFrame(50);
    const light = hero.querySelector<HTMLElement>("[data-hero-light]");
    expect(light?.dataset.on).toBe("");
    hero.dispatchEvent(new MouseEvent("pointermove", { clientX: 320, clientY: 400 }));
    hero.dispatchEvent(new Event("pointerleave"));
    runFrame(80);
    expect(light?.dataset.on).toBeUndefined();
  });

  test("ignores touch pointers", () => {
    const hero = buildHero();
    start(hero);
    observerCallback([{ isIntersecting: true }]);
    const touch = new MouseEvent("pointermove", { clientX: 300, clientY: 400 });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    hero.dispatchEvent(touch);
    runFrame(50);
    expect(hero.querySelector<HTMLElement>("[data-hero-light]")?.dataset.on).toBeUndefined();
  });

  test("re-lays out on resize and hides the layers on destroy", () => {
    const hero = buildHero();
    const handle = start(hero);
    window.dispatchEvent(new Event("resize"));
    observerCallback([{ isIntersecting: true }]);
    handle.destroy();
    expect(frames.size).toBe(0);
    expect(hero.querySelector<HTMLElement>("[data-hero-golem]")?.hidden).toBe(true);
    expect(hero.querySelector<HTMLElement>("canvas")?.hidden).toBe(true);
  });

  test("clicking the golem shows the next phrase", () => {
    const hero = buildHero();
    start(hero);
    const bubble = hero.querySelector<HTMLElement>("[data-hero-bubble]");
    expect(bubble?.textContent).toBe("one");
    hero.querySelector<HTMLElement>("[data-hero-golem]")?.click();
    expect(bubble?.textContent).toBe("two");
    expect(bubble?.classList.contains("is-on")).toBe(true);
  });
});

function setup(): {
  button: HTMLElement;
  bubble: HTMLElement;
  clicks: () => number;
  stop: () => void;
} {
  const button = document.createElement("button");
  const bubble = document.createElement("p");
  let clicks = 0;
  const stop = initGolemHotspot({
    button,
    bubble,
    phrases: ["a", "b", "c", "d"],
    onClick: () => {
      clicks += 1;
    },
  });
  return { button, bubble, clicks: () => clicks, stop };
}

describe("initGolemHotspot", () => {
  test("shows the bubble on hover and focus and hides it on leave and blur", () => {
    const { button, bubble, stop } = setup();
    for (const [on, off] of [
      ["pointerenter", "pointerleave"],
      ["focus", "blur"],
    ] as const) {
      button.dispatchEvent(new Event(on));
      expect(bubble.classList.contains("is-on")).toBe(true);
      button.dispatchEvent(new Event(off));
      expect(bubble.classList.contains("is-on")).toBe(false);
    }
    stop();
  });

  test("click cycles phrases, wraps, calls back and stops after cleanup", () => {
    const { button, bubble, clicks, stop } = setup();
    expect(BUBBLE_VISIBLE_MS).toBe(3200);
    for (const expected of ["b", "c", "d", "a"]) {
      button.click();
      expect(bubble.textContent).toBe(expected);
    }
    expect(clicks()).toBe(4);
    stop();
    button.click();
    expect(clicks()).toBe(4);
  });
});
