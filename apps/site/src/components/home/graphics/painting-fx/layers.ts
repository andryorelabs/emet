import type { EyeFrame } from "./eyes";
import { buildFlowMap } from "./flow-map";
import {
  createFullQuad,
  createProgram,
  loadDataTexture,
  loadTexture,
  QUAD_VERTEX_SHADER,
} from "./gl";
import { canvasSize, eyeRegion } from "./layout";
import { EYES_FRAGMENT, WATER_FRAGMENT } from "./shaders";
import type { PaintingData, Point, Size } from "./types";

/** A GL layer drawn onto its own canvas. */
interface GlLayer {
  /** Draws one frame at `pixelScale` canvas pixels per painting unit. */
  draw(pixelScale: number): void;
  /** Frees programs, textures and buffers. */
  dispose(): void;
}

/** The river layer also needs the clock. */
export interface WaterLayer extends GlLayer {
  setTime(nowMs: number): void;
}

/** The eyes layer also needs the frame to draw. */
export interface EyesLayer extends GlLayer {
  setFrame(frame: EyeFrame): void;
}

/** What a layer needs to be built. */
export interface LayerInit {
  readonly canvas: HTMLCanvasElement;
  readonly image: TexImageSource;
  readonly painting: PaintingData;
  readonly onLost: () => void;
}

const WATER_FLOW_AMPLITUDE = 12;
const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  antialias: false,
  premultipliedAlpha: true,
  alpha: true,
};

/** Creates a WebGL context on `canvas`, or null when unavailable. */
export function getGl(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  try {
    return canvas.getContext("webgl", CONTEXT_ATTRIBUTES);
  } catch {
    return null;
  }
}

/** True when a throwaway canvas yields a WebGL context; the probe context is released at once. */
export function probeWebgl(): boolean {
  const gl = getGl(document.createElement("canvas"));
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return gl !== null;
}

function resize(canvas: HTMLCanvasElement, size: Size): void {
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
}

function pointUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
  point: Point,
): void {
  gl.uniform2f(gl.getUniformLocation(program, name), point[0], point[1]);
}

function rectUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  region: { x: number; y: number; width: number; height: number },
): void {
  gl.uniform4f(
    gl.getUniformLocation(program, "uR"),
    region.x,
    region.y,
    region.width,
    region.height,
  );
}

function guardLoss(canvas: HTMLCanvasElement, onLost: () => void): () => void {
  const handler = (event: Event): void => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener("webglcontextlost", handler);
  return () => {
    canvas.removeEventListener("webglcontextlost", handler);
  };
}

/** Builds the river layer over `painting.waterRegion`; null without a region or a working GL. */
export function createWaterLayer(init: LayerInit): WaterLayer | null {
  const { canvas, image, painting } = init;
  const region = painting.waterRegion;
  const gl = region ? getGl(canvas) : null;
  if (!region || !gl) return null;
  const program = createProgram(gl, QUAD_VERTEX_SHADER, WATER_FRAGMENT);
  const quad = program ? createFullQuad(gl) : null;
  if (!program || !quad) return null;
  quad.bind(program);
  const flowSize = { width: Math.round(region.width), height: Math.round(region.height) };
  const flow = buildFlowMap(region, painting.river, flowSize);
  const photo = loadTexture(gl, image, 0);
  const flowTexture = loadDataTexture(gl, flow, flowSize.width, flowSize.height, 1);
  if (!photo || !flowTexture) return null;
  gl.uniform1i(gl.getUniformLocation(program, "uI"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uF"), 1);
  rectUniform(gl, program, region);
  pointUniform(gl, program, "uS", [painting.size.width, painting.size.height]);
  gl.uniform1f(gl.getUniformLocation(program, "uA"), WATER_FLOW_AMPLITUDE);
  const timeUniform = gl.getUniformLocation(program, "uT");
  const unguard = guardLoss(canvas, init.onLost);
  let seconds = 0;
  return {
    setTime(nowMs) {
      seconds = nowMs / 1000;
    },
    draw(pixelScale) {
      const size = canvasSize(region, pixelScale);
      resize(canvas, size);
      gl.viewport(0, 0, size.width, size.height);
      gl.uniform1f(timeUniform, seconds);
      quad.draw();
    },
    dispose() {
      unguard();
      quad.dispose();
      gl.deleteTexture(photo);
      gl.deleteTexture(flowTexture);
      gl.deleteProgram(program);
    },
  };
}

/** Builds the eyes layer for `painting.eyes` scaled by `eyeScale`; null without a working GL. */
export function createEyesLayer(init: LayerInit, eyeScale: number): EyesLayer | null {
  const { canvas, image, painting } = init;
  const gl = getGl(canvas);
  if (!gl) return null;
  const program = createProgram(gl, QUAD_VERTEX_SHADER, EYES_FRAGMENT);
  const quad = program ? createFullQuad(gl) : null;
  if (!program || !quad) return null;
  quad.bind(program);
  const region = eyeRegion(painting.eyes, eyeScale);
  const photo = loadTexture(gl, image, 0);
  if (!photo) return null;
  gl.uniform1i(gl.getUniformLocation(program, "uI"), 0);
  rectUniform(gl, program, region);
  pointUniform(gl, program, "uS", [painting.size.width, painting.size.height]);
  pointUniform(gl, program, "uE0", painting.eyes[0]);
  pointUniform(gl, program, "uE1", painting.eyes[1]);
  gl.uniform1f(gl.getUniformLocation(program, "uK"), eyeScale);
  const lidUniform = gl.getUniformLocation(program, "uLid");
  const glowUniform = gl.getUniformLocation(program, "uGlow");
  const unguard = guardLoss(canvas, init.onLost);
  let current: EyeFrame = {
    offsets: [
      [0, 0],
      [0, 0],
    ],
    lid: 1,
    glow: 0,
  };
  return {
    setFrame(frame) {
      current = frame;
    },
    draw(pixelScale) {
      const size = canvasSize(region, pixelScale);
      resize(canvas, size);
      gl.viewport(0, 0, size.width, size.height);
      pointUniform(gl, program, "uO0", current.offsets[0]);
      pointUniform(gl, program, "uO1", current.offsets[1]);
      gl.uniform1f(lidUniform, current.lid);
      gl.uniform1f(glowUniform, current.glow);
      quad.draw();
    },
    dispose() {
      unguard();
      quad.dispose();
      gl.deleteTexture(photo);
      gl.deleteProgram(program);
    },
  };
}
