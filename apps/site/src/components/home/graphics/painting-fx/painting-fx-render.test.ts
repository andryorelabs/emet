import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { paintingFx, PORTRAIT_PAINTING, VALLEY_PAINTING } from "./index";
import type { PaintingFxHandle, PaintingFxOptions } from "./index";
import { createEyesLayer, createWaterLayer, getGl, probeWebgl } from "./layers";
import { canvasSize, cloudTransform, eyeRegion, placeRect, skyMaskGradient } from "./layout";
import { EYES_FRAGMENT, WATER_FRAGMENT } from "./shaders";

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface GlFlags {
  failShader?: boolean;
  noTexture?: boolean;
  noBuffer?: boolean;
  noProgram?: boolean;
}

interface Env {
  reducedMotion: boolean;
  width: number;
  coarse: boolean;
  webgl: boolean;
  glFlags: GlFlags;
  throwOnContext: boolean;
  hidden: boolean;
}

const env: Env = {
  reducedMotion: false,
  width: 1440,
  coarse: false,
  webgl: true,
  glFlags: {},
  throwOnContext: false,
  hidden: false,
};

let glCalls: Call[] = [];
let frames: ((now: number) => void)[] = [];
let intersections: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
let resizes: (() => void)[] = [];
let probeLost = 0;
let observeCalls = 0;
const originalGetContext = (): unknown => undefined;
let restoreGetContext: () => void = originalGetContext;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function makeGl(flags: GlFlags): WebGLRenderingContext {
  const constants: Record<string, number> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE0: 100,
  };
  const returns: Record<string, () => unknown> = {
    createShader: () => ({}),
    createProgram: () => (flags.noProgram ? null : {}),
    createTexture: () => (flags.noTexture ? null : {}),
    createBuffer: () => (flags.noBuffer ? null : {}),
    getShaderParameter: () => !flags.failShader,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getExtension: () => ({
      loseContext() {
        probeLost += 1;
      },
    }),
  };
  const proxy: object = new Proxy(
    {},
    {
      get(_target, key) {
        const name = String(key);
        if (name in constants) return constants[name];
        if (/^[A-Z0-9_]+$/.test(name)) return name.length;
        return (...args: unknown[]) => {
          glCalls.push({ name, args });
          return returns[name]?.();
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

function fakeGetContext(): unknown {
  if (env.throwOnContext) throw new Error("blocked");
  return env.webgl ? makeGl(env.glFlags) : null;
}

function installCanvas(): void {
  const proto = HTMLCanvasElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "getContext");
  Object.defineProperty(proto, "getContext", { value: fakeGetContext, configurable: true });
  restoreGetContext = () => {
    if (descriptor) Object.defineProperty(proto, "getContext", descriptor);
  };
}

class FakeIntersectionObserver {
  constructor(handler: (entries: { isIntersecting: boolean }[]) => void) {
    intersections.push(handler);
  }
  observe(): void {
    observeCalls += 1;
  }
  disconnect(): void {
    observeCalls -= 1;
  }
}

class FakeResizeObserver {
  constructor(handler: () => void) {
    resizes.push(handler);
  }
  observe(): void {
    observeCalls += 1;
  }
  disconnect(): void {
    observeCalls -= 1;
  }
}

beforeAll(() => {
  GlobalRegistrator.register();
  installCanvas();
});

afterAll(() => {
  restoreGetContext();
  return GlobalRegistrator.unregister();
});

beforeEach(() => {
  document.body.innerHTML = "";
  Object.assign(env, {
    reducedMotion: false,
    width: 1440,
    coarse: false,
    webgl: true,
    glFlags: {},
    throwOnContext: false,
    hidden: false,
  });
  glCalls = [];
  frames = [];
  intersections = [];
  resizes = [];
  probeLost = 0;
  observeCalls = 0;
  define("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? env.reducedMotion : env.coarse,
  }));
  define("innerWidth", env.width);
  define("IntersectionObserver", FakeIntersectionObserver);
  define("ResizeObserver", FakeResizeObserver);
  define("requestAnimationFrame", (callback: (now: number) => void) => {
    frames.push(callback);
    return frames.length;
  });
  define("cancelAnimationFrame", () => {
    frames = [];
  });
  define("devicePixelRatio", 3);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => env.hidden });
});

afterEach(() => {
  document.body.innerHTML = "";
});

function makeHost(ready = true): { host: HTMLElement; image: HTMLImageElement } {
  const host = document.createElement("div");
  const image = document.createElement("img");
  image.src = "/valley.webp";
  Object.defineProperty(image, "complete", { value: ready, configurable: true });
  Object.defineProperty(image, "naturalWidth", { value: ready ? 1672 : 0, configurable: true });
  Object.defineProperty(host, "clientWidth", { value: 1440, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 900, configurable: true });
  host.append(image);
  document.body.append(host);
  return { host, image };
}

function start(
  overrides: Partial<PaintingFxOptions> = {},
  ready = true,
): { host: HTMLElement; handle: PaintingFxHandle } {
  const { host } = makeHost(ready);
  env.width = 1440;
  define("innerWidth", env.width);
  const handle = paintingFx(host, {
    painting: VALLEY_PAINTING,
    effects: { clouds: true, water: true, eyes: true },
    ...overrides,
  });
  return { host, handle };
}

function show(visible = true): void {
  for (const handler of intersections) handler([{ isIntersecting: visible }]);
}

function runFrame(now: number): void {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame(now);
}

const names = (): string[] => glCalls.map((call) => call.name);

describe("layout helpers", () => {
  test("eyeRegion pads both eyes by the scale", () => {
    expect(
      eyeRegion(
        [
          [100, 50],
          [140, 52],
        ],
        2,
      ),
    ).toEqual({
      x: 52,
      y: 6,
      width: 136,
      height: 94,
    });
  });

  test("placeRect maps painting units into the host", () => {
    expect(
      placeRect({ x: 10, y: 20, width: 30, height: 40 }, { scale: 2, offsetX: -5, offsetY: 7 }),
    ).toEqual({ x: 15, y: 47, width: 60, height: 80 });
  });

  test("skyMaskGradient fades between the two mask stops", () => {
    const gradient = skyMaskGradient(
      { width: 100, height: 200 },
      { scale: 1, offsetX: 0, offsetY: 10 },
      [0.5, 0.75],
    );
    expect(gradient).toBe("linear-gradient(180deg,#000 0,#000 110px,transparent 160px)");
  });

  test("cloudTransform drifts with a sine and stretches", () => {
    expect(cloudTransform(0, 1000)).toBe("translateX(0.00px) scaleX(1.05)");
    expect(cloudTransform(17500, 1000)).toBe("translateX(26.00px) scaleX(1.05)");
  });

  test("canvasSize rounds and never drops below two pixels", () => {
    expect(canvasSize({ x: 0, y: 0, width: 10.4, height: 0.1 }, 2)).toEqual({
      width: 21,
      height: 2,
    });
  });

  test("shaders declare the uniforms the layers set", () => {
    for (const name of ["uI", "uF", "uT", "uR", "uS", "uA"]) expect(WATER_FRAGMENT).toContain(name);
    for (const name of ["uE0", "uE1", "uO0", "uO1", "uLid", "uGlow", "uK"]) {
      expect(EYES_FRAGMENT).toContain(name);
    }
  });
});

describe("getGl and probeWebgl", () => {
  test("getGl returns the context, null when absent and null when it throws", () => {
    const canvas = document.createElement("canvas");
    expect(getGl(canvas)).not.toBeNull();
    env.webgl = false;
    expect(getGl(canvas)).toBeNull();
    env.webgl = true;
    env.throwOnContext = true;
    expect(getGl(canvas)).toBeNull();
  });

  test("probeWebgl reports support and releases the probe context", () => {
    expect(probeWebgl()).toBe(true);
    expect(probeLost).toBe(1);
    env.webgl = false;
    expect(probeWebgl()).toBe(false);
  });
});

function makeImage(): HTMLCanvasElement {
  return document.createElement("canvas");
}

const init = (): Parameters<typeof createWaterLayer>[0] => ({
  canvas: document.createElement("canvas"),
  image: makeImage(),
  painting: VALLEY_PAINTING,
  onLost: () => {
    observeCalls += 1;
  },
});

describe("layers", () => {
  test("water builds a flow map, uploads two textures and draws a strip", () => {
    const layer = createWaterLayer(init());
    expect(layer).not.toBeNull();
    layer?.setTime(2500);
    layer?.draw(1);
    layer?.draw(1);
    expect(names().filter((name) => name === "texImage2D")).toHaveLength(2);
    expect(
      glCalls.filter((call) => call.name === "uniform1f").map((call) => call.args[1]),
    ).toContain(2.5);
    expect(names()).toContain("drawArrays");
    layer?.dispose();
    expect(names().filter((name) => name === "deleteTexture")).toHaveLength(2);
  });

  test("water is null without a region, a context, a program, a quad or textures", () => {
    expect(createWaterLayer({ ...init(), painting: PORTRAIT_PAINTING })).toBeNull();
    env.webgl = false;
    expect(createWaterLayer(init())).toBeNull();
    env.webgl = true;
    env.glFlags = { failShader: true };
    expect(createWaterLayer(init())).toBeNull();
    env.glFlags = { noBuffer: true };
    expect(createWaterLayer(init())).toBeNull();
    env.glFlags = { noTexture: true };
    expect(createWaterLayer(init())).toBeNull();
  });

  test("eyes draw the frame they were given", () => {
    const layer = createEyesLayer(init(), 1);
    expect(layer).not.toBeNull();
    layer?.draw(2);
    layer?.setFrame({
      offsets: [
        [1, 2],
        [3, 4],
      ],
      lid: 0.5,
      glow: 0.25,
    });
    layer?.draw(2);
    const uniforms = glCalls
      .filter((call) => call.name === "uniform1f")
      .map((call) => call.args[1]);
    expect(uniforms).toContain(0.5);
    expect(uniforms).toContain(0.25);
    layer?.dispose();
    expect(names()).toContain("deleteProgram");
  });

  test("eyes are null without a context, a program, a quad or a texture", () => {
    env.webgl = false;
    expect(createEyesLayer(init(), 1)).toBeNull();
    env.webgl = true;
    env.glFlags = { failShader: true };
    expect(createEyesLayer(init(), 1)).toBeNull();
    env.glFlags = { noBuffer: true };
    expect(createEyesLayer(init(), 1)).toBeNull();
    env.glFlags = { noTexture: true };
    expect(createEyesLayer(init(), 1)).toBeNull();
  });

  test("a lost context calls back and prevents the default", () => {
    let lost = 0;
    const canvas = document.createElement("canvas");
    const layer = createWaterLayer({ ...init(), canvas, onLost: () => (lost += 1) });
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);
    expect(lost).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    layer?.dispose();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(lost).toBe(1);
  });
});

describe("paintingFx", () => {
  test("builds nothing without an image", () => {
    const host = document.createElement("div");
    const handle = paintingFx(host, { painting: VALLEY_PAINTING, effects: {} });
    handle.blink();
    handle.glow();
    handle.destroy();
    expect(host.children).toHaveLength(0);
    expect(host.dataset.fx).toBeUndefined();
  });

  test("stays off for reduced motion, small viewports, coarse pointers and missing WebGL", () => {
    const cases: Partial<Env>[] = [
      { reducedMotion: true },
      { width: 800 },
      { coarse: true },
      { webgl: false },
    ];
    for (const change of cases) {
      document.body.innerHTML = "";
      Object.assign(env, { reducedMotion: false, width: 1440, coarse: false, webgl: true }, change);
      define("innerWidth", env.width);
      const { host } = makeHost();
      const handle = paintingFx(host, { painting: VALLEY_PAINTING, effects: { clouds: true } });
      handle.destroy();
      expect(host.querySelectorAll("canvas")).toHaveLength(0);
      expect(host.dataset.fx).toBeUndefined();
    }
  });

  test("does no work until the host is on screen", () => {
    const { host } = start();
    expect(host.querySelectorAll("canvas")).toHaveLength(2);
    expect(frames).toHaveLength(0);
    expect(host.dataset.fx).toBeUndefined();
    show();
    expect(frames).toHaveLength(1);
  });

  test("draws clouds, water and eyes and marks the host", () => {
    const { host } = start();
    show();
    runFrame(1000);
    expect(host.dataset.fx).toBe("on");
    const [sky] = host.querySelectorAll("div");
    expect(sky?.hidden).toBe(false);
    expect(sky?.style.getPropertyValue("transform")).toContain("scaleX(1.05)");
    expect(sky?.style.getPropertyValue("mask-image")).toContain("linear-gradient");
    const canvases = [...host.querySelectorAll("canvas")];
    expect(canvases.map((canvas) => canvas.hidden)).toEqual([false, false]);
    expect(canvases[0]?.style.getPropertyValue("width")).not.toBe("");
    expect(names().filter((name) => name === "drawArrays")).toHaveLength(2);
    expect(frames).toHaveLength(1);
  });

  test("keeps the loop going frame after frame", () => {
    start();
    show();
    runFrame(1000);
    runFrame(1016);
    expect(names().filter((name) => name === "drawArrays")).toHaveLength(4);
  });

  test("leaves out effects that are not requested", () => {
    const { host } = start({ effects: {} });
    show();
    runFrame(1000);
    const [sky] = host.querySelectorAll("div");
    expect(sky?.hidden).toBe(true);
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
    expect(names()).not.toContain("drawArrays");
  });

  test("skips water for a painting without a river", () => {
    start({ painting: PORTRAIT_PAINTING });
    show();
    runFrame(1000);
    expect(names().filter((name) => name === "drawArrays")).toHaveLength(1);
  });

  test("steers the eyes toward the gaze and honours blink and glow", () => {
    const { handle } = start({ gaze: () => ({ x: 0, y: 0 }) });
    show();
    handle.blink();
    handle.glow();
    runFrame(performance.now() + 1);
    const offsets = glCalls.filter((call) => call.name === "uniform2f").map((call) => call.args);
    expect(offsets.some((args) => typeof args[1] === "number" && args[1] < 0)).toBe(true);
  });

  test("uses a null gaze as no gaze", () => {
    start({ gaze: () => null, eyeScale: 2, skyMask: [0.2, 0.3], objectPosition: [0, 0] });
    show();
    runFrame(1000);
    expect(names()).toContain("drawArrays");
  });

  test("hides every layer and the marker while `when` is false", () => {
    let allowed = true;
    const { host } = start({ when: () => allowed });
    show();
    runFrame(1000);
    expect(host.dataset.fx).toBe("on");
    allowed = false;
    runFrame(1016);
    expect(host.dataset.fx).toBeUndefined();
    expect(host.querySelector("div")?.hidden).toBe(true);
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
    allowed = true;
    runFrame(1032);
    expect(host.dataset.fx).toBe("on");
  });

  test("pauses off screen and on a hidden tab, and resumes", () => {
    start();
    show();
    runFrame(1000);
    show(false);
    runFrame(1016);
    expect(frames).toHaveLength(0);
    show();
    expect(frames).toHaveLength(1);
    env.hidden = true;
    runFrame(1032);
    expect(frames).toHaveLength(0);
    env.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames).toHaveLength(1);
  });

  test("an empty observer batch counts as not visible", () => {
    start();
    for (const handler of intersections) handler([]);
    expect(frames).toHaveLength(0);
  });

  test("waits for the painting to decode before using GL", () => {
    const { host } = start({}, false);
    show();
    runFrame(1000);
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
    expect(names()).not.toContain("drawArrays");
  });

  test("falls back to the CSS Valley layers when GL fails to build", () => {
    env.glFlags = { failShader: true };
    const { host } = start();
    show();
    runFrame(1000);
    runFrame(1016);
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
  });

  test("keeps the Valley fallback visible when no layer rendered", () => {
    env.glFlags = { failShader: true };
    const { host } = start({ effects: { water: true, eyes: true } });
    show();
    runFrame(1000);
    runFrame(1016);
    expect(host.dataset.fx).toBeUndefined();
  });

  test("replaces only the Valley layers whose effect rendered", () => {
    env.glFlags = { failShader: true };
    const { host, handle } = start();
    show();
    runFrame(1000);
    runFrame(1016);
    expect(host.dataset.fx).toBe("on");
    expect(host.dataset.fxClouds).toBe("");
    expect(host.dataset.fxWater).toBeUndefined();
    expect(host.dataset.fxEyes).toBeUndefined();
    handle.destroy();
    expect(host.dataset.fx).toBeUndefined();
    expect(host.dataset.fxClouds).toBeUndefined();
  });

  test("hides a layer whose context was lost", () => {
    const { host } = start();
    show();
    runFrame(1000);
    for (const canvas of host.querySelectorAll("canvas")) {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    }
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
    runFrame(1016);
    expect([...host.querySelectorAll("canvas")].every((canvas) => canvas.hidden)).toBe(true);
  });

  test("re-lays out when the host resizes", () => {
    const { host } = start();
    Object.defineProperty(host, "clientWidth", { value: 700, configurable: true });
    for (const handler of resizes) handler();
    show();
    runFrame(1000);
    expect(host.querySelector("canvas")?.style.getPropertyValue("left")).not.toBe("");
  });

  test("destroy stops the loop, frees layers and removes everything", () => {
    const { host, handle } = start();
    show();
    runFrame(1000);
    handle.destroy();
    handle.destroy();
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    expect(host.querySelectorAll("div")).toHaveLength(0);
    expect(host.dataset.fx).toBeUndefined();
    expect(names()).toContain("deleteProgram");
    show();
    expect(frames).toHaveLength(0);
  });
});
