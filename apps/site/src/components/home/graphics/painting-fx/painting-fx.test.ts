import { describe, expect, test } from "bun:test";

import { BLINK_MS, GAZE_FULL_DISTANCE, GAZE_MAX_UNITS, GLOW_DECAY_MS } from "./eyes";
import {
  blink,
  buildFlowMap,
  coverGeometry,
  createEyeState,
  createFullQuad,
  createProgram,
  fxEnabled,
  gazeTargets,
  glow,
  loadDataTexture,
  loadTexture,
  PORTRAIT_PAINTING,
  QUAD_VERTEX_SHADER,
  stepEyes,
  VALLEY_PAINTING,
} from "./index";
import type {
  EyeFrame,
  EyeState,
  EyeTargets,
  FullQuad,
  FxEnv,
  PaintingData,
  Point,
  Polyline,
  Rect,
  Size,
} from "./index";

const STILL: EyeTargets = [
  [0, 0],
  [0, 0],
];

describe("painting data", () => {
  test("valley and portrait carry the measured sizes and eyes", () => {
    const valley: PaintingData = VALLEY_PAINTING;
    expect(valley.size).toEqual({ width: 1672, height: 941 });
    expect(valley.eyes).toEqual([
      [1352, 672],
      [1385.5, 672.5],
    ]);
    expect(valley.river).toHaveLength(4);
    expect(valley.waterRegion).toEqual({ x: 560, y: 600, width: 600, height: 341 });
    expect(PORTRAIT_PAINTING.size).toEqual({ width: 1122, height: 1402 });
    expect(PORTRAIT_PAINTING.eyes).toEqual([
      [571, 760],
      [756, 757],
    ]);
    expect(PORTRAIT_PAINTING.waterRegion).toBeNull();
  });
});

describe("coverGeometry", () => {
  test("matches object-fit cover for the hero valley at 50% 62%", () => {
    const image: Size = { width: 1672, height: 941 };
    const geometry = coverGeometry(image, { width: 1440, height: 900 }, [0.5, 0.62]);
    const scale = Math.max(1440 / 1672, 900 / 941);
    expect(geometry.scale).toBeCloseTo(scale, 10);
    expect(geometry.offsetX).toBeCloseTo((1440 - 1672 * scale) * 0.5, 10);
    expect(geometry.offsetY).toBeCloseTo((900 - 941 * scale) * 0.62, 10);
    expect(geometry.offsetX).toBeCloseTo(-79.5, 0);
  });

  test("overflows vertically in a tall box", () => {
    const geometry = coverGeometry(
      { width: 1672, height: 941 },
      { width: 390, height: 844 },
      [0.5, 0.62],
    );
    expect(geometry.scale).toBeCloseTo(844 / 941, 10);
    expect(geometry.offsetX).toBeLessThan(0);
    expect(geometry.offsetY).toBeCloseTo(0, 10);
  });
});

const alphaAt = (data: Uint8ClampedArray, col: number, row: number): number =>
  data[(row * 8 + col) * 4 + 3] ?? -1;

describe("buildFlowMap", () => {
  const region: Rect = { x: 0, y: 0, width: 8, height: 8 };
  const line: Polyline = {
    points: [
      [0, 4],
      [8, 4],
    ],
    widths: [3, 3],
  };
  test("is transparent away from the river and flows along the line", () => {
    const data = buildFlowMap(region, [line], { width: 8, height: 8 });
    expect(data).toHaveLength(8 * 8 * 4);
    expect(alphaAt(data, 4, 0)).toBe(0);
    expect(alphaAt(data, 4, 3)).toBeGreaterThan(200);
    const q = (3 * 8 + 4) * 4;
    expect(data[q]).toBe(255);
    expect(data[q + 1]).toBe(128);
  });

  test("an empty river yields a zero mask with neutral direction", () => {
    const data = buildFlowMap(region, [], { width: 2, height: 2 });
    expect(Array.from(data.slice(0, 4))).toEqual([128, 128, 0, 0]);
  });

  test("keeps the strongest segment and tolerates missing widths", () => {
    const ragged: Polyline = {
      points: [
        [0, 4],
        [8, 4],
        [8, 0],
      ],
      widths: [3],
    };
    const data = buildFlowMap(region, [line, ragged], { width: 8, height: 8 });
    expect(alphaAt(data, 4, 3)).toBeGreaterThan(200);
  });

  test("builds the valley river map", () => {
    const water = VALLEY_PAINTING.waterRegion;
    expect(water).not.toBeNull();
    if (!water) return;
    const data = buildFlowMap(water, VALLEY_PAINTING.river, { width: 60, height: 34 });
    const covered = data.filter((_, i) => i % 4 === 3 && (data[i] ?? 0) > 0).length;
    expect(covered).toBeGreaterThan(0);
  });
});

describe("eyes", () => {
  test("gaze eases toward the target and caps at the maximum", () => {
    const state: EyeState = createEyeState();
    const target: EyeTargets = [
      [GAZE_MAX_UNITS, 0],
      [0, GAZE_MAX_UNITS],
    ];
    let frame: EyeFrame = stepEyes(state, target, 0);
    expect(frame.offsets[0][0]).toBeCloseTo(0.75, 5);
    for (let i = 1; i < 60; i += 1) frame = stepEyes(state, target, i * 16);
    expect(frame.offsets[0][0]).toBeCloseTo(GAZE_MAX_UNITS, 2);
    expect(frame.offsets[1][1]).toBeCloseTo(GAZE_MAX_UNITS, 2);
  });

  test("a blink dips the lid for 160 ms and then recovers", () => {
    const state = createEyeState();
    expect(stepEyes(state, STILL, 0).lid).toBe(1);
    blink(state, 100);
    expect(stepEyes(state, STILL, 100).lid).toBeCloseTo(1, 5);
    expect(stepEyes(state, STILL, 100 + BLINK_MS / 2).lid).toBeCloseTo(0.12, 5);
    expect(stepEyes(state, STILL, 100 + BLINK_MS + 1).lid).toBe(1);
  });

  test("blinks on its own after about three seconds and reschedules", () => {
    const state = createEyeState(() => 0);
    stepEyes(state, STILL, 0);
    expect(stepEyes(state, STILL, 2999).lid).toBe(1);
    stepEyes(state, STILL, 3001);
    expect(stepEyes(state, STILL, 3001 + BLINK_MS / 2).lid).toBeLessThan(1);
    expect(state.nextBlinkAt).toBe(3001 + 3500);
  });

  test("glow starts at 1 and decays to 0 over 900 ms", () => {
    const state = createEyeState();
    expect(stepEyes(state, STILL, 10).glow).toBe(0);
    glow(state, 1000);
    expect(stepEyes(state, STILL, 1000).glow).toBe(1);
    expect(stepEyes(state, STILL, 1000 + GLOW_DECAY_MS / 2).glow).toBeCloseTo(0.5, 5);
    expect(stepEyes(state, STILL, 1000 + GLOW_DECAY_MS * 2).glow).toBe(0);
  });

  test("gazeTargets points at the cursor, scales and falls back to zero", () => {
    const geometry = { scale: 1, offsetX: 0, offsetY: 0 };
    const eyes: readonly [Point, Point] = [
      [100, 100],
      [200, 100],
    ];
    const far = gazeTargets(eyes, [100 + GAZE_FULL_DISTANCE * 2, 100], geometry, 1);
    expect(far[0][0]).toBeCloseTo(GAZE_MAX_UNITS, 5);
    expect(far[0][1]).toBeCloseTo(0, 5);
    const near = gazeTargets(eyes, [145, 100], geometry, 2);
    expect(near[0][0]).toBeCloseTo(0.5 * GAZE_MAX_UNITS * 2, 5);
    expect(gazeTargets(eyes, null, geometry, 1)).toEqual(STILL);
    expect(gazeTargets(eyes, [100, 100], geometry, 1)[0]).toEqual([0, 0]);
  });
});

describe("fxEnabled", () => {
  const base: FxEnv = {
    reducedMotion: false,
    coarsePointer: false,
    webgl: true,
  };

  test("is on for a fine-pointer viewer with WebGL at any width", () => {
    expect(fxEnabled(base)).toBe(true);
    expect(fxEnabled({ ...base, viewportWidth: 390 } as FxEnv)).toBe(true);
  });

  test.each([
    ["reduced motion", { reducedMotion: true }],
    ["coarse pointer", { coarsePointer: true }],
    ["no WebGL", { webgl: false }],
  ])("is off with %s", (_name, patch) => {
    expect(fxEnabled({ ...base, ...patch })).toBe(false);
  });
});

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface FakeOptions {
  failShader?: boolean;
  failLink?: boolean;
  noShader?: boolean;
  noProgram?: boolean;
  noTexture?: boolean;
  noBuffer?: boolean;
}

function fakeGl(options: FakeOptions = {}): { gl: WebGLRenderingContext; calls: Call[] } {
  const calls: Call[] = [];
  const constants: Record<string, number> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE0: 100,
  };
  const returns: Record<string, (...args: unknown[]) => unknown> = {
    createShader: () => (options.noShader ? null : {}),
    createProgram: () => (options.noProgram ? null : {}),
    createTexture: () => (options.noTexture ? null : {}),
    createBuffer: () => (options.noBuffer ? null : {}),
    getShaderParameter: () => !options.failShader,
    getProgramParameter: () => !options.failLink,
    getAttribLocation: () => 7,
  };
  const target: object = {};
  const proxy = new Proxy(target, {
    get(_target, key) {
      const name = String(key);
      if (name in constants) return constants[name];
      if (/^[A-Z0-9_]+$/.test(name)) return name.length;
      return (...args: unknown[]) => {
        calls.push({ name, args });
        return returns[name]?.(...args);
      };
    },
  });
  if (!isGl(proxy)) throw new Error("unreachable");
  return { gl: proxy, calls };
}

function isGl(_value: object): _value is WebGLRenderingContext {
  return true;
}

function fakeImage(): TexImageSource {
  const canvasLike: object = { width: 1, height: 1 };
  if (!isImage(canvasLike)) throw new Error("unreachable");
  return canvasLike;
}

function isImage(_value: object): _value is TexImageSource {
  return true;
}

const names = (calls: readonly Call[]): string[] => calls.map((call) => call.name);

describe("createProgram", () => {
  test("compiles, links and uses the program", () => {
    const { gl, calls } = fakeGl();
    expect(createProgram(gl, QUAD_VERTEX_SHADER, "void main(){}")).not.toBeNull();
    expect(names(calls)).toEqual([
      "createShader",
      "shaderSource",
      "compileShader",
      "getShaderParameter",
      "createShader",
      "shaderSource",
      "compileShader",
      "getShaderParameter",
      "createProgram",
      "attachShader",
      "attachShader",
      "linkProgram",
      "deleteShader",
      "deleteShader",
      "getProgramParameter",
      "useProgram",
    ]);
  });

  test("returns null and frees the shader when compilation fails", () => {
    const { gl, calls } = fakeGl({ failShader: true });
    expect(createProgram(gl, "bad", "bad")).toBeNull();
    expect(names(calls)).toContain("deleteShader");
  });

  test("returns null and frees the program when linking fails", () => {
    const { gl, calls } = fakeGl({ failLink: true });
    expect(createProgram(gl, "v", "f")).toBeNull();
    expect(names(calls)).toContain("deleteProgram");
  });

  test("frees the compiled shaders when the program cannot be created", () => {
    const { gl, calls } = fakeGl({ noProgram: true });
    expect(createProgram(gl, "v", "f")).toBeNull();
    expect(names(calls).filter((name) => name === "deleteShader")).toHaveLength(2);
  });

  test("returns null when the context cannot create shaders or programs", () => {
    expect(createProgram(fakeGl({ noShader: true }).gl, "v", "f")).toBeNull();
    expect(createProgram(fakeGl({ noProgram: true }).gl, "v", "f")).toBeNull();
  });
});

describe("textures", () => {
  test("loadTexture uploads the image flipped on the requested unit", () => {
    const { gl, calls } = fakeGl();
    const image = fakeImage();
    expect(loadTexture(gl, image)).not.toBeNull();
    expect(calls.find((call) => call.name === "activeTexture")?.args[0]).toBe(100);
    expect(calls.find((call) => call.name === "pixelStorei")?.args[1]).toBe(true);
    expect(calls.at(-1)?.name).toBe("texImage2D");
    expect(calls.at(-1)?.args.at(-1)).toBe(image);
    loadTexture(gl, image, 2);
    expect(calls.findLast((call) => call.name === "activeTexture")?.args[0]).toBe(102);
  });

  test("loadDataTexture uploads raw bytes unflipped", () => {
    const { gl, calls } = fakeGl();
    const data = new Uint8ClampedArray(16);
    expect(loadDataTexture(gl, data, 2, 2)).not.toBeNull();
    expect(calls.find((call) => call.name === "pixelStorei")?.args[1]).toBe(false);
    const upload = calls.at(-1);
    expect(upload?.name).toBe("texImage2D");
    expect(upload?.args.at(-1)).toBeInstanceOf(Uint8Array);
    expect(calls.find((call) => call.name === "activeTexture")?.args[0]).toBe(101);
  });

  test("both return null when no texture can be created", () => {
    const { gl } = fakeGl({ noTexture: true });
    expect(loadTexture(gl, fakeImage())).toBeNull();
    expect(loadDataTexture(gl, new Uint8ClampedArray(4), 1, 1)).toBeNull();
  });
});

describe("createFullQuad", () => {
  test("binds, draws and disposes the quad", () => {
    const { gl, calls } = fakeGl();
    const quad: FullQuad | null = createFullQuad(gl);
    expect(quad).not.toBeNull();
    if (!quad) return;
    quad.bind({});
    quad.draw();
    quad.dispose();
    const drawn = calls.find((call) => call.name === "drawArrays");
    expect(drawn?.args.slice(1)).toEqual([0, 4]);
    expect(names(calls)).toContain("vertexAttribPointer");
    expect(names(calls).at(-1)).toBe("deleteBuffer");
  });

  test("returns null when the buffer cannot be created", () => {
    expect(createFullQuad(fakeGl({ noBuffer: true }).gl)).toBeNull();
  });
});
