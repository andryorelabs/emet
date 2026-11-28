import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { followReach, initLetters, letterReach, lettersEnabled, splitLetters } from "./letters";

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let reduced = false;
let coarse = false;
let tabHidden = false;
let origin: [number, number] = [0, 0];

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function runFrame(): void {
  const pending = [...frames.values()];
  frames = new Map();
  for (const callback of pending) callback(0);
}

function buildHero(): HTMLElement {
  document.body.innerHTML = `<section class="hero"><h1>
    <span class="hero-line"><span data-letters>Spec to merge,</span></span>
    <span class="hero-line"><span data-letters>one approval.</span></span></h1></section>`;
  const hero = document.querySelector<HTMLElement>(".hero");
  if (!hero) throw new Error("fixture missing");
  return hero;
}

function placeLetters(): HTMLElement[] {
  const letters = [...document.querySelectorAll<HTMLElement>(".hero-letter")];
  for (const [index, letter] of letters.entries()) {
    letter.getBoundingClientRect = () => new DOMRect(origin[0] + index * 20, origin[1], 20, 20);
  }
  return letters;
}

function move(hero: HTMLElement, x: number, y: number, pointerType = "mouse"): void {
  const event = new Event("pointermove");
  Object.assign(event, { clientX: x, clientY: y, pointerType });
  hero.dispatchEvent(event);
}

beforeAll(() => {
  GlobalRegistrator.register();
  define("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  define("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  define("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduced : query.includes("coarse") ? coarse : false,
  }));
  define("innerWidth", 1440);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => tabHidden });
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  reduced = false;
  coarse = false;
  tabHidden = false;
  origin = [0, 0];
  frames = new Map();
  define("innerWidth", 1440);
});

describe("letterReach", () => {
  test("is 1 on the letter, squares the falloff and is 0 from 100px", () => {
    expect(letterReach(0)).toBe(1);
    expect(letterReach(50)).toBeCloseTo(0.25, 10);
    expect(letterReach(100)).toBe(0);
    expect(letterReach(400)).toBe(0);
  });
});

describe("followReach", () => {
  test("moves a fifth of the way and snaps when nearly there", () => {
    expect(followReach(0, 1)).toBeCloseTo(0.2, 10);
    expect(followReach(0.998, 1)).toBe(1);
    expect(followReach(0.5, 0)).toBeCloseTo(0.4, 10);
  });
});

describe("lettersEnabled", () => {
  test("needs motion, a fine pointer and more than 900px", () => {
    const base = { reducedMotion: false, coarsePointer: false, viewportWidth: 1440 };
    expect(lettersEnabled(base)).toBe(true);
    expect(lettersEnabled({ ...base, reducedMotion: true })).toBe(false);
    expect(lettersEnabled({ ...base, coarsePointer: true })).toBe(false);
    expect(lettersEnabled({ ...base, viewportWidth: 900 })).toBe(false);
  });
});

describe("splitLetters", () => {
  test("wraps each non-space character and keeps the text", () => {
    const line = document.createElement("span");
    line.textContent = "ab c";
    const letters = splitLetters(line);
    expect(letters.map((letter) => letter.textContent)).toEqual(["a", "b", "c"]);
    expect(line.textContent).toBe("ab c");
  });
});

describe("initLetters", () => {
  test("tints the letters near a resting pointer, nearest first, and keeps the h1 text", () => {
    const hero = buildHero();
    const before = document.querySelector("h1")?.textContent;
    const stop = initLetters(hero);
    move(hero, 10, 10);
    const letters = placeLetters();
    expect(document.querySelector("h1")?.textContent).toBe(before);
    for (let step = 0; step < 30; step++) runFrame();
    const reach = letters.map((letter) => Number(letter.style.getPropertyValue("--k")));
    expect(reach[0]).toBeGreaterThan(0.5);
    expect(reach[1]).toBeLessThan(reach[0] ?? 0);
    expect(reach.at(-1)).toBe(0);
    expect(frames.size).toBe(0);
    stop();
  });

  test("lets the letters fall back once the pointer leaves", () => {
    const hero = buildHero();
    const stop = initLetters(hero);
    move(hero, 10, 10);
    const letters = placeLetters();
    for (let step = 0; step < 30; step++) runFrame();
    hero.dispatchEvent(new Event("pointerleave"));
    for (let step = 0; step < 60; step++) runFrame();
    expect(Number(letters[0]?.style.getPropertyValue("--k"))).toBe(0);
    expect(frames.size).toBe(0);
    stop();
  });

  test("changes nothing under reduced motion, a coarse pointer, touch or a narrow viewport", () => {
    const hero = buildHero();
    const stop = initLetters(hero);
    reduced = true;
    move(hero, 10, 10);
    reduced = false;
    coarse = true;
    move(hero, 10, 10);
    coarse = false;
    define("innerWidth", 600);
    move(hero, 10, 10);
    define("innerWidth", 1440);
    move(hero, 10, 10, "touch");
    expect(document.querySelectorAll(".hero-letter")).toHaveLength(0);
    expect(frames.size).toBe(0);
    stop();
  });

  test("settles to zero when reduced motion turns on mid-hover and when the tab is hidden", () => {
    const hero = buildHero();
    const stop = initLetters(hero);
    move(hero, 10, 10);
    const letters = placeLetters();
    runFrame();
    expect(Number(letters[0]?.style.getPropertyValue("--k"))).toBeGreaterThan(0);
    reduced = true;
    for (let step = 0; step < 60; step++) runFrame();
    expect(Number(letters[0]?.style.getPropertyValue("--k"))).toBe(0);
    reduced = false;
    tabHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    move(hero, 10, 10);
    expect(frames.size).toBe(0);
    stop();
  });

  test("stop cancels the frame, removes the listeners and restores the text", () => {
    const hero = buildHero();
    const stop = initLetters(hero);
    move(hero, 10, 10);
    placeLetters();
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    expect(document.querySelectorAll(".hero-letter")).toHaveLength(0);
    expect(document.querySelector("[data-letters]")?.textContent).toBe("Spec to merge,");
    move(hero, 10, 10);
    expect(frames.size).toBe(0);
    expect(() => {
      initLetters(hero)();
    }).not.toThrow();
  });

  test("ignores a host without lettered lines", () => {
    const empty = document.createElement("section");
    const stop = initLetters(empty);
    move(empty, 5, 5);
    runFrame();
    stop();
    expect(frames.size).toBe(0);
  });
});
