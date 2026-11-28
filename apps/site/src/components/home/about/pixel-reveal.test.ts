import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { cellSize, cellThresholds, coverRect, initPixelReveal } from "./pixel-reveal";

interface Call {
  method: string;
  args: unknown[];
}

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let observerCallback: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
let observerDisconnected = false;
let calls: Call[] = [];
let tabHidden = false;
let qualities: (string | undefined)[] = [];

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class FakeObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    observerCallback = callback;
  }
  observe(): void {
    return undefined;
  }
  disconnect(): void {
    observerDisconnected = true;
  }
}

function isContext(value: object): value is CanvasRenderingContext2D {
  return "drawImage" in value && "canvas" in value;
}

function fakeContext(): CanvasRenderingContext2D {
  const context = {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: undefined as string | undefined,
    canvas: {},
    drawImage: (...args: unknown[]) => {
      qualities.push(context.imageSmoothingQuality);
      calls.push({ method: "drawImage", args });
    },
  };
  if (!isContext(context)) throw new Error("fake context is incomplete");
  return context;
}

interface FakeCanvas {
  element: HTMLCanvasElement;
  state: () => string | undefined;
}

function fakeCanvas(hasContext = true): FakeCanvas {
  const context = hasContext ? fakeContext() : null;
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { value: 440, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: 550, configurable: true });
  Object.defineProperty(element, "getContext", { value: () => context });
  return { element, state: () => element.dataset.state };
}

function fakeImage(complete: boolean): { image: HTMLImageElement; target: EventTarget } {
  const image = document.createElement("img");
  Object.defineProperty(image, "complete", { value: complete, configurable: true });
  Object.defineProperty(image, "naturalWidth", { value: complete ? 1122 : 0, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: 1402, configurable: true });
  return { image, target: image };
}

const revealed: { destroy(): void }[] = [];

function start(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  durationMs: number,
): { destroy(): void } {
  const reveal = initPixelReveal(canvas, image, { durationMs, reduce: false });
  revealed.push(reveal);
  return reveal;
}

function runFrame(time: number): void {
  const pending = [...frames.entries()];
  frames = new Map();
  for (const [, callback] of pending) callback(time);
}

function setHidden(value: boolean): void {
  tabHidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("coverRect", () => {
  test("crops the sides of a wide image for a tall canvas", () => {
    expect(coverRect(200, 100, 50, 100)).toEqual({ sx: 75, sy: 0, sw: 50, sh: 100 });
  });

  test("crops the top and bottom of a tall image for a wide canvas", () => {
    expect(coverRect(100, 200, 100, 50)).toEqual({ sx: 0, sy: 75, sw: 100, sh: 50 });
  });
});

describe("cellSize and cellThresholds", () => {
  test("cells never drop below the minimum and scale with the width", () => {
    expect(cellSize(100)).toBe(18);
    expect(cellSize(880)).toBe(40);
  });

  test("thresholds are stable, in range and as many as asked", () => {
    const first = cellThresholds(50);
    expect(first).toHaveLength(50);
    expect(cellThresholds(50)).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(first).size).toBeGreaterThan(40);
  });
});

describe("initPixelReveal", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    define("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    define("IntersectionObserver", FakeObserver);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => tabHidden });
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  afterEach(() => {
    for (const reveal of revealed.splice(0)) reveal.destroy();
  });

  beforeEach(() => {
    frames = new Map();
    calls = [];
    observerDisconnected = false;
    tabHidden = false;
  });

  test("under reduced motion it leaves the canvas untouched", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    const reveal = initPixelReveal(canvas.element, image, { durationMs: 1400, reduce: true });
    expect(canvas.state()).toBeUndefined();
    expect(frames.size).toBe(0);
    expect(() => {
      reveal.destroy();
    }).not.toThrow();
  });

  test("without a 2D context it is a no-op", () => {
    const canvas = fakeCanvas(false);
    const { image } = fakeImage(true);
    start(canvas.element, image, 1400).destroy();
    expect(canvas.state()).toBeUndefined();
  });

  test("waits for the image to load, then paints the coarse mosaic and marks ready", () => {
    const canvas = fakeCanvas();
    const { image, target } = fakeImage(false);
    start(canvas.element, image, 1400);
    expect(canvas.state()).toBeUndefined();
    Object.defineProperty(image, "complete", { value: true, configurable: true });
    Object.defineProperty(image, "naturalWidth", { value: 1122, configurable: true });
    target.dispatchEvent(new Event("load"));
    expect(canvas.state()).toBe("ready");
    expect(canvas.element.width).toBe(440);
    expect(calls.length).toBeGreaterThan(1);
  });

  test("resolves in the given duration once in view and finishes on the full image", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    start(canvas.element, image, 1000);
    expect(frames.size).toBe(0);
    observerCallback([{ isIntersecting: true }]);
    expect(frames.size).toBe(1);
    runFrame(performance.now() + 100);
    expect(canvas.state()).toBe("ready");
    calls = [];
    runFrame(performance.now() + 5000);
    expect(canvas.state()).toBe("done");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.slice(5)).toEqual([0, 0, 440, 550]);
    expect(frames.size).toBe(0);
  });

  test("draws the last frame with high smoothing quality", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    start(canvas.element, image, 1000);
    observerCallback([{ isIntersecting: true }]);
    qualities = [];
    runFrame(performance.now() + 5000);
    expect(qualities).toEqual(["high"]);
  });

  test("hides the canvas once its fade ends, or after a fallback delay", async () => {
    const first = fakeCanvas();
    const { image } = fakeImage(true);
    start(first.element, image, 1000);
    observerCallback([{ isIntersecting: true }]);
    runFrame(performance.now() + 5000);
    expect(first.state()).toBe("done");
    expect(first.element.hidden).toBe(false);
    first.element.dispatchEvent(new Event("transitionend"));
    expect(first.element.hidden).toBe(true);
    const second = fakeCanvas();
    start(second.element, image, 1000);
    observerCallback([{ isIntersecting: true }]);
    runFrame(performance.now() + 5000);
    expect(second.element.hidden).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(second.element.hidden).toBe(true);
  });

  test("pauses off-screen and on a hidden tab and resumes afterwards", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    start(canvas.element, image, 1000);
    observerCallback([{ isIntersecting: true }]);
    expect(frames.size).toBe(1);
    observerCallback([{ isIntersecting: false }]);
    expect(frames.size).toBe(0);
    observerCallback([{ isIntersecting: true }]);
    setHidden(true);
    expect(frames.size).toBe(0);
    setHidden(false);
    expect(frames.size).toBe(1);
    observerCallback([{ isIntersecting: true }]);
    expect(frames.size).toBe(1);
  });

  test("repaints on resize until done", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    start(canvas.element, image, 1000);
    calls = [];
    Object.defineProperty(canvas.element, "clientWidth", { value: 220, configurable: true });
    Object.defineProperty(canvas.element, "clientHeight", { value: 275, configurable: true });
    globalThis.dispatchEvent(new Event("resize"));
    expect(canvas.element.width).toBe(220);
    expect(calls.length).toBeGreaterThan(0);
  });

  test("destroy disconnects, cancels the frame and stops listening", () => {
    const canvas = fakeCanvas();
    const { image } = fakeImage(true);
    const reveal = start(canvas.element, image, 1000);
    observerCallback([{ isIntersecting: true }]);
    reveal.destroy();
    expect(observerDisconnected).toBe(true);
    expect(frames.size).toBe(0);
    calls = [];
    globalThis.dispatchEvent(new Event("resize"));
    expect(calls).toHaveLength(0);
  });
});
