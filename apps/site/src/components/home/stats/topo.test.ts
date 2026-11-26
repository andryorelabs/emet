import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initTopo } from "./topo";

const WIDTH = 900;
const HEIGHT = 700;
const COLOR = "rgb(127, 184, 74)";

interface Call {
  name: string;
  args: unknown[];
}

class FakePath {
  moves = 0;
  moveTo(): void {
    this.moves++;
  }
  lineTo(): void {
    this.moves++;
  }
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly callback: (entries: unknown[]) => void;
  disconnected = false;
  observed: Element[] = [];
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeIntersectionObserver extends FakeObserver {}
class FakeResizeObserver extends FakeObserver {}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

let clock = 0;
let queue: FrameRequestCallback[] = [];
let cancelled = 0;
let calls: Call[] = [];

function record(name: string): (...args: unknown[]) => unknown {
  return (...args) => {
    calls.push({ name, args });
    return name === "measureText" ? { width: 24 } : undefined;
  };
}

function fakeContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  const context = new Proxy(target, {
    get: (store, key) => {
      if (typeof key !== "string") return undefined;
      if (key in store) return store[key];
      return record(key);
    },
    set: (store, key, value) => {
      if (typeof key === "string") store[key] = value;
      return true;
    },
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the port only calls the drawing methods the proxy records
  return context as unknown as CanvasRenderingContext2D;
}

function called(name: string): Call[] {
  return calls.filter((call) => call.name === name);
}

function runFrames(untilMs: number, stepMs = 16): void {
  while (clock < untilMs) {
    clock += stepMs;
    const pending = queue;
    queue = [];
    for (const callback of pending) callback(clock);
  }
}

function rect(width: number, height: number, left = 0, top = 0): DOMRect {
  return new DOMRect(left, top, width, height);
}

interface Scene {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  button: HTMLButtonElement;
}

function scene(context: CanvasRenderingContext2D | null | "throws" = fakeContext()): Scene {
  document.body.innerHTML = `<section id="root"><canvas></canvas><div class="content"><button>go</button></div></section>`;
  const root = document.querySelector<HTMLElement>("#root");
  const canvas = document.querySelector("canvas");
  const content = document.querySelector<HTMLElement>(".content");
  const button = document.querySelector("button");
  if (!root || !canvas || !content || !button) throw new Error("scene markup");
  canvas.getBoundingClientRect = () => rect(WIDTH, HEIGHT);
  content.getBoundingClientRect = () => rect(300, 200, 100, 100);
  Object.defineProperty(canvas, "getContext", {
    value: () => {
      if (context === "throws") throw new Error("no canvas");
      return context;
    },
  });
  return { root, canvas, button };
}

function pointer(type: string, x: number, y: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType });
}

function observers<T extends FakeObserver>(kind: new (...args: never[]) => T): T[] {
  return FakeObserver.instances.filter((instance): instance is T => instance instanceof kind);
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("initTopo", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    clock = 0;
    queue = [];
    cancelled = 0;
    calls = [];
    FakeObserver.instances = [];
    define("Path2D", FakePath);
    define("IntersectionObserver", FakeIntersectionObserver);
    define("ResizeObserver", FakeResizeObserver);
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queue.push(callback);
      return queue.length;
    });
    define("cancelAnimationFrame", () => {
      cancelled++;
    });
    performance.now = () => clock;
  });

  afterEach(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  test("is a no-op without a 2D context, with a throwing context, or without Path2D", () => {
    for (const context of [null, "throws"] as const) {
      const { canvas } = scene(context);
      const handle = initTopo(canvas, { color: COLOR, reduce: false });
      expect(() => {
        handle.destroy();
      }).not.toThrow();
      expect(queue).toHaveLength(0);
      expect(FakeObserver.instances).toHaveLength(0);
    }
    define("Path2D", undefined);
    const { canvas } = scene();
    initTopo(canvas, { color: COLOR, reduce: false }).destroy();
    expect(called("clearRect")).toHaveLength(0);
  });

  test("paints one still frame with reduced motion and wires no motion", () => {
    const { canvas, root } = scene();
    initTopo(canvas, { color: COLOR, reduce: true });
    expect(canvas.width).toBe(WIDTH);
    expect(canvas.height).toBe(HEIGHT);
    expect(called("setTransform")[0]?.args).toEqual([1, 0, 0, 1, 0, 0]);
    expect(called("clearRect")).toHaveLength(1);
    expect(called("stroke")).toHaveLength(2);
    expect(called("fillText").length).toBeGreaterThan(0);
    expect(queue).toHaveLength(0);
    root.dispatchEvent(pointer("pointerdown", 500, 400));
    root.dispatchEvent(pointer("pointermove", 500, 400));
    expect(queue).toHaveLength(0);
    expect(observers(FakeIntersectionObserver)[0]?.observed).toEqual([root]);
  });

  test("strokes in the given colour", () => {
    const context = fakeContext();
    const { canvas } = scene(context);
    initTopo(canvas, { color: COLOR, reduce: true });
    expect(context.strokeStyle).toBe(COLOR);
    expect(context.fillStyle).toBe(COLOR);
  });

  test("keeps animating, painting at the idle rate", () => {
    const { canvas } = scene();
    initTopo(canvas, { color: COLOR, reduce: false });
    expect(queue).toHaveLength(1);
    const first = called("clearRect").length;
    runFrames(500);
    expect(called("clearRect").length).toBeGreaterThan(first + 5);
    expect(called("clearRect").length).toBeLessThan(500 / 16 + 2);
    expect(queue).toHaveLength(1);
  });

  test("raises a hill that follows the mouse and settles when it leaves", () => {
    const { canvas, root } = scene();
    initTopo(canvas, { color: COLOR, reduce: false });
    runFrames(100);
    root.dispatchEvent(pointer("pointermove", 450, 350, "touch"));
    root.dispatchEvent(pointer("pointermove", 450, 350));
    root.dispatchEvent(pointer("pointermove", 520, 380));
    runFrames(600);
    root.dispatchEvent(pointer("pointerleave", 0, 0));
    const before = called("clearRect").length;
    runFrames(2000);
    expect(called("clearRect").length).toBeGreaterThan(before);
  });

  test("ripples on pointer down, skips controls and caps the ripples", () => {
    const { canvas, root, button } = scene();
    initTopo(canvas, { color: COLOR, reduce: false });
    runFrames(100);
    button.dispatchEvent(pointer("pointerdown", 150, 150));
    for (let n = 0; n < 6; n++) root.dispatchEvent(pointer("pointerdown", 200 + n * 40, 300));
    const before = called("clearRect").length;
    runFrames(400);
    expect(called("clearRect").length - before).toBeGreaterThanOrEqual(15);
    runFrames(2600);
    expect(queue).toHaveLength(1);
  });

  test("ignores pointer downs that do not come from an element", () => {
    const { canvas, root } = scene();
    initTopo(canvas, { color: COLOR, reduce: false });
    root.dispatchEvent(pointer("pointerdown", 10, 10));
    expect(queue).toHaveLength(1);
  });

  test("pauses off screen and on a hidden tab, then resumes", () => {
    const { canvas } = scene();
    initTopo(canvas, { color: COLOR, reduce: false });
    const [intersection] = observers(FakeIntersectionObserver);
    if (!intersection) throw new Error("no observer");
    intersection.callback([]);
    expect(queue).toHaveLength(1);
    intersection.callback([{ isIntersecting: false }]);
    runFrames(100);
    expect(queue).toHaveLength(0);
    const paused = called("clearRect").length;
    runFrames(200);
    expect(called("clearRect").length).toBe(paused);
    intersection.callback([{ isIntersecting: true }]);
    expect(queue).toHaveLength(1);
    setHidden(true);
    runFrames(300);
    expect(queue).toHaveLength(0);
    setHidden(false);
    expect(queue).toHaveLength(1);
  });

  test("repaints on resize with the device pixel ratio capped at two", () => {
    const { canvas } = scene();
    window.devicePixelRatio = 3;
    initTopo(canvas, { color: COLOR, reduce: true });
    expect(canvas.width).toBe(WIDTH * 2);
    window.devicePixelRatio = 0;
    canvas.getBoundingClientRect = () => rect(0, 0);
    const [resizer] = observers(FakeResizeObserver);
    resizer?.callback([]);
    expect(canvas.width).toBe(1);
    expect(called("clearRect")).toHaveLength(2);
    window.devicePixelRatio = 1;
  });

  test("destroy stops the loop, observers and listeners", () => {
    const { canvas, root } = scene();
    const handle = initTopo(canvas, { color: COLOR, reduce: false });
    runFrames(100);
    handle.destroy();
    expect(cancelled).toBe(1);
    for (const observer of FakeObserver.instances) expect(observer.disconnected).toBe(true);
    const before = called("clearRect").length;
    root.dispatchEvent(pointer("pointermove", 100, 100));
    root.dispatchEvent(pointer("pointerdown", 100, 100));
    runFrames(400);
    expect(called("clearRect").length).toBe(before);
    setHidden(false);
    expect(queue).toHaveLength(0);
  });

  test("runs without observers and uses the canvas as its own root", () => {
    define("IntersectionObserver", undefined);
    define("ResizeObserver", undefined);
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => rect(300, 200);
    Object.defineProperty(canvas, "getContext", { value: fakeContext });
    const handle = initTopo(canvas, { color: COLOR, reduce: false });
    runFrames(100);
    expect(called("clearRect").length).toBeGreaterThan(1);
    handle.destroy();
  });
});
