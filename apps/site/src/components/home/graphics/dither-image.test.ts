import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import {
  clampProgress,
  DITHER_CELL,
  ditherCellSize,
  initDitherImage as initRaw,
  resolveColor,
} from "./dither-image";
import type { DitherImage } from "./dither-image";
import type { DitherImageOptions } from "./dither-image";

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface FakeGlOptions {
  failShader?: boolean;
  noBuffer?: boolean;
}

let calls: Call[] = [];
let queue = new Map<number, FrameRequestCallback>();
let nextHandle = 1;
let observers: FakeObserver[] = [];
let images: FakeImage[] = [];
let hidden = false;
let started: DitherImage[] = [];

function initDitherImage(
  canvas: HTMLCanvasElement,
  src: string,
  config: DitherImageOptions,
): DitherImage | null {
  const handle = initRaw(canvas, src, config);
  if (handle) started.push(handle);
  return handle;
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class FakeObserver {
  disconnected = false;
  readonly handler: (entries: { isIntersecting: boolean }[]) => void;
  constructor(handler: (entries: { isIntersecting: boolean }[]) => void) {
    this.handler = handler;
    observers.push(this);
  }
  observe(): void {
    return undefined;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeImage {
  crossOrigin = "";
  decoding = "";
  naturalWidth = 200;
  naturalHeight = 100;
  src = "";
  private readonly loadListeners: (() => void)[] = [];
  constructor() {
    images.push(this);
  }
  addEventListener(_type: string, listener: () => void): void {
    this.loadListeners.push(listener);
  }
  fireLoad(): void {
    for (const listener of this.loadListeners) listener();
  }
}

function fakeGl(flags: FakeGlOptions = {}): WebGLRenderingContext {
  const constants: Record<string, number> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE0: 100,
  };
  const returns: Record<string, (...args: unknown[]) => unknown> = {
    createShader: () => ({}),
    createProgram: () => ({}),
    createTexture: () => ({}),
    createBuffer: () => (flags.noBuffer ? null : {}),
    getShaderParameter: () => !flags.failShader,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getUniformLocation: (_program, name) => name,
  };
  const proxy: object = new Proxy(
    {},
    {
      get(_target, key) {
        const name = String(key);
        if (name in constants) return constants[name];
        if (/^[A-Z0-9_]+$/.test(name)) return name.length;
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return returns[name]?.(...args);
        };
      },
    },
  );
  if (!isGl(proxy)) throw new Error("unreachable");
  return proxy;
}

function isGl(_value: object): _value is WebGLRenderingContext {
  return true;
}

function fakeCanvas(
  gl: WebGLRenderingContext | null,
  size = { width: 100, height: 50 },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: size.width });
  Object.defineProperty(canvas, "clientHeight", { value: size.height });
  Object.defineProperty(canvas, "getContext", { value: () => gl });
  return canvas;
}

function options(overrides: Partial<DitherImageOptions> = {}): DitherImageOptions {
  return {
    palette: ["#111111", "#888888", "#eeeeee"],
    getProgress: () => 0,
    reduce: false,
    ...overrides,
  };
}

const count = (name: string): number => calls.filter((call) => call.name === name).length;

function uniformValue(name: string, last = true): readonly unknown[] | undefined {
  const matches = calls.filter((call) => call.name.startsWith("uniform") && call.args[0] === name);
  return (last ? matches[matches.length - 1] : matches[0])?.args.slice(1);
}

function runFrame(): void {
  const pending = [...queue.entries()];
  queue = new Map();
  for (const [, callback] of pending) callback(0);
}

function show(index = 0): void {
  observers[index]?.handler([{ isIntersecting: true }]);
}

function load(): void {
  images[0]?.fireLoad();
}

describe("pure helpers", () => {
  test("clampProgress limits to 0..1 and rejects non-finite values", () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(0.4)).toBe(0.4);
    expect(clampProgress(3)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
  });

  test("ditherCellSize shrinks from the base cell to one pixel", () => {
    expect(ditherCellSize(0, 1)).toBe(DITHER_CELL);
    expect(ditherCellSize(0, 2)).toBe(DITHER_CELL * 2);
    expect(ditherCellSize(1, 1)).toBe(1);
    expect(ditherCellSize(1, 2)).toBe(2);
  });
});

describe("dither-image", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    calls = [];
    queue = new Map();
    nextHandle = 1;
    observers = [];
    images = [];
    hidden = false;
    started = [];
    define("Image", FakeImage);
    define("IntersectionObserver", FakeObserver);
    define("ResizeObserver", FakeObserver);
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    });
    define("cancelAnimationFrame", (handle: number) => {
      queue.delete(handle);
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  });

  afterEach(() => {
    for (const handle of started) handle.destroy();
  });

  describe("resolveColor", () => {
    let original: PropertyDescriptor | undefined;

    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
    });

    afterEach(() => {
      if (original) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", original);
    });

    test("reads the pixel back as 0..1 rgb", () => {
      const context = {
        fillStyle: "",
        fillRect: () => undefined,
        getImageData: () => ({ data: [255, 0, 51, 255] }),
      };
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value: () => context,
      });
      expect(resolveColor("#f03", [0, 0, 0])).toEqual([1, 0, 0.2]);
    });

    test("falls back when there is no 2D context", () => {
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value: () => null,
      });
      expect(resolveColor("red", [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    });
  });

  test("returns null without WebGL", () => {
    expect(initDitherImage(fakeCanvas(null), "/a.png", options())).toBeNull();
    expect(images).toHaveLength(0);
  });

  test("returns null when the program cannot be built", () => {
    const canvas = fakeCanvas(fakeGl({ failShader: true }));
    expect(initDitherImage(canvas, "/a.png", options())).toBeNull();
  });

  test("returns null and frees the program when the quad buffer fails", () => {
    const canvas = fakeCanvas(fakeGl({ noBuffer: true }));
    expect(initDitherImage(canvas, "/a.png", options())).toBeNull();
    expect(count("deleteProgram")).toBe(1);
  });

  test("starts the image load and draws nothing before it arrives", () => {
    const handle = initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    expect(handle).not.toBeNull();
    expect(images[0]?.src).toBe("/a.png");
    handle?.redraw();
    expect(count("drawArrays")).toBe(0);
  });

  test("draws the coarse dither at progress 0", () => {
    const canvas = fakeCanvas(fakeGl());
    initDitherImage(canvas, "/a.png", options());
    load();
    show();
    runFrame();
    expect(count("drawArrays")).toBe(1);
    expect(uniformValue("uProgress")).toEqual([0]);
    expect(uniformValue("uCell")).toEqual([DITHER_CELL * 1]);
    expect(uniformValue("uResolution")).toEqual([100, 50]);
    expect(uniformValue("uImageAspect")).toEqual([2]);
    expect(uniformValue("uBoxAspect")).toEqual([2]);
    expect(count("viewport")).toBe(1);
  });

  test("resolves to the plain image at progress 1 and skips unchanged frames", () => {
    let progress = 0;
    initDitherImage(fakeCanvas(fakeGl()), "/a.png", options({ getProgress: () => progress }));
    load();
    show();
    runFrame();
    runFrame();
    expect(count("drawArrays")).toBe(1);
    progress = 1;
    runFrame();
    expect(count("drawArrays")).toBe(2);
    expect(uniformValue("uProgress")).toEqual([1]);
    expect(uniformValue("uCell")).toEqual([1]);
  });

  test("redraw paints immediately and clamps progress", () => {
    const handle = initDitherImage(
      fakeCanvas(fakeGl()),
      "/a.png",
      options({ getProgress: () => 5 }),
    );
    load();
    handle?.redraw();
    expect(count("drawArrays")).toBe(1);
    expect(uniformValue("uProgress")).toEqual([1]);
  });

  test("reduced motion draws once on load and never loops", () => {
    const handle = initDitherImage(
      fakeCanvas(fakeGl()),
      "/a.png",
      options({ reduce: true, getProgress: () => 1 }),
    );
    load();
    show();
    expect(count("drawArrays")).toBe(1);
    expect(queue.size).toBe(0);
    handle?.redraw();
    expect(count("drawArrays")).toBe(2);
    observers[1]?.handler([]);
    expect(count("drawArrays")).toBe(3);
  });

  test("a resize observation repaints a running image on the next frame", () => {
    initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    load();
    show();
    runFrame();
    observers[1]?.handler([]);
    runFrame();
    expect(count("drawArrays")).toBe(2);
  });

  test("pauses off-screen and resumes on-screen", () => {
    initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    load();
    show();
    expect(queue.size).toBe(1);
    observers[0]?.handler([{ isIntersecting: false }]);
    expect(queue.size).toBe(0);
    observers[0]?.handler([]);
    expect(queue.size).toBe(0);
    show();
    expect(queue.size).toBe(1);
  });

  test("pauses on a hidden tab and resumes when visible", () => {
    initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    load();
    show();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(queue.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(queue.size).toBe(1);
  });

  test("a frame that fires while hidden stops the loop", () => {
    initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    load();
    show();
    hidden = true;
    runFrame();
    expect(count("drawArrays")).toBe(0);
    expect(queue.size).toBe(0);
  });

  test("destroy stops everything and frees GL resources", () => {
    const handle = initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    load();
    show();
    handle?.destroy();
    expect(queue.size).toBe(0);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(count("deleteTexture")).toBe(1);
    expect(count("deleteBuffer")).toBe(1);
    expect(count("deleteProgram")).toBe(1);
    handle?.redraw();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(count("drawArrays")).toBe(0);
    expect(queue.size).toBe(0);
  });

  test("destroy before the image loads skips the texture and ignores the late load", () => {
    const handle = initDitherImage(fakeCanvas(fakeGl()), "/a.png", options());
    handle?.destroy();
    load();
    expect(count("deleteTexture")).toBe(0);
    expect(count("texImage2D")).toBe(0);
  });
});
