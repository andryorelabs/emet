import { createFullQuad, createProgram, loadTexture, QUAD_VERTEX_SHADER } from "./painting-fx";

/** Options for {@link initDitherImage}. */
export interface DitherImageOptions {
  /** Dark, mid and light CSS colours of the dither ramp. */
  readonly palette: readonly [string, string, string];
  /** Returns the reveal progress; 0 is a coarse dither, 1 is the plain image. */
  readonly getProgress: () => number;
  /** Draws a single frame on load and on `redraw()` instead of polling progress. */
  readonly reduce: boolean;
}

/** Handle returned by {@link initDitherImage}. */
export interface DitherImage {
  /** Repaints immediately with the current progress. */
  redraw(): void;
  /** Stops all observers and frees every GL resource. */
  destroy(): void;
}

/** A colour as 0..1 red, green and blue. */
export type Rgb = readonly [number, number, number];

/** Dither cell size in CSS pixels at progress 0. */
export const DITHER_CELL = 4;
/** Number of quantised tones. */
const DITHER_LEVELS = 3;
/** Contrast applied to the luma before thresholding. */
const DITHER_CONTRAST = 1.15;
/** Maximum device pixel ratio the canvas renders at. */
const MAX_DPR = 2;
/** Progress change below which a frame is skipped. */
const PROGRESS_EPSILON = 0.002;

const FALLBACK_DARK: Rgb = [0.07, 0.07, 0.07];
const FALLBACK_MID: Rgb = [0.5, 0.5, 0.5];
const FALLBACK_LIGHT: Rgb = [0.93, 0.93, 0.93];

const FRAGMENT_SHADER = `precision highp float;
varying vec2 v;
uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uCell;
uniform float uLevels;
uniform float uContrast;
uniform float uBoxAspect;
uniform float uImageAspect;
uniform float uProgress;
uniform vec3 uDark;
uniform vec3 uMid;
uniform vec3 uLight;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 uv = v;
  if (uBoxAspect > uImageAspect) {
    uv.y = (uv.y - 0.5) * (uImageAspect / uBoxAspect) + 0.5;
  } else {
    uv.x = (uv.x - 0.5) * (uBoxAspect / uImageAspect) + 0.5;
  }
  vec2 sampleUv = floor(uv * uResolution / uCell) * uCell / uResolution;
  vec3 texel = texture2D(uImage, sampleUv).rgb;
  float luma = dot(texel, vec3(0.2126, 0.7152, 0.0722));
  luma = clamp((luma - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float threshold = bayer4(v * uResolution / uCell) * 1.0667;
  float steps = max(uLevels - 1.0, 1.0);
  float value = clamp(floor(luma * steps + threshold) / steps, 0.0, 1.0);
  vec3 dithered = value < 0.5
    ? mix(uDark, uMid, value * 2.0)
    : mix(uMid, uLight, (value - 0.5) * 2.0);
  gl_FragColor = vec4(mix(dithered, texel, smoothstep(0.15, 1.0, uProgress)), 1.0);
}`;

/** Clamps a raw progress value into 0..1, treating non-finite input as 0. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Effective dither cell in device pixels: coarse at progress 0, one pixel at 1. */
export function ditherCellSize(progress: number, dpr: number): number {
  return Math.max(1, DITHER_CELL * (1 - progress)) * dpr;
}

/** Resolves a CSS colour to 0..1 RGB through a 2D canvas; `fallback` when unavailable. */
export function resolveColor(css: string, fallback: Rgb): Rgb {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return fallback;
  context.fillStyle = "#000";
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const data = context.getImageData(0, 0, 1, 1).data;
  return [(data[0] ?? 0) / 255, (data[1] ?? 0) / 255, (data[2] ?? 0) / 255];
}

/**
 * Draws a Bayer dither of `src` in the palette, resolving to the plain image at
 * progress 1. Returns null when WebGL is unavailable so the caller keeps the plain image.
 */
export function initDitherImage(
  canvas: HTMLCanvasElement,
  src: string,
  options: DitherImageOptions,
): DitherImage | null {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  const program = createProgram(gl, QUAD_VERTEX_SHADER, FRAGMENT_SHADER);
  const quad = createFullQuad(gl);
  if (!program || !quad) {
    quad?.dispose();
    if (program) gl.deleteProgram(program);
    return null;
  }
  quad.bind(program);

  const dark = resolveColor(options.palette[0], FALLBACK_DARK);
  const mid = resolveColor(options.palette[1], FALLBACK_MID);
  const light = resolveColor(options.palette[2], FALLBACK_LIGHT);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string): WebGLUniformLocation | null => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };

  let texture: WebGLTexture | null = null;
  let aspect = 1;
  let destroyed = false;
  let onScreen = false;
  let frameHandle = 0;
  let lastDrawn = -1;
  let dirty = true;

  const resize = (): number => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      dirty = true;
    }
    return dpr;
  };

  const draw = (force: boolean): void => {
    if (destroyed || !texture) return;
    const progress = clampProgress(options.getProgress());
    const dpr = resize();
    if (!force && !dirty && Math.abs(progress - lastDrawn) < PROGRESS_EPSILON) return;
    lastDrawn = progress;
    dirty = false;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniform("uImage"), 0);
    gl.uniform2f(uniform("uResolution"), canvas.width, canvas.height);
    gl.uniform1f(uniform("uCell"), ditherCellSize(progress, dpr));
    gl.uniform1f(uniform("uLevels"), DITHER_LEVELS);
    gl.uniform1f(uniform("uContrast"), DITHER_CONTRAST);
    gl.uniform1f(uniform("uBoxAspect"), canvas.width / Math.max(canvas.height, 1));
    gl.uniform1f(uniform("uImageAspect"), aspect);
    gl.uniform1f(uniform("uProgress"), progress);
    gl.uniform3fv(uniform("uDark"), dark);
    gl.uniform3fv(uniform("uMid"), mid);
    gl.uniform3fv(uniform("uLight"), light);
    quad.draw();
  };

  const canRun = (): boolean => !destroyed && !options.reduce && onScreen && !document.hidden;

  const cancelFrame = (): void => {
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  const frame = (): void => {
    frameHandle = 0;
    if (!canRun()) return;
    draw(false);
    frameHandle = requestAnimationFrame(frame);
  };

  const schedule = (): void => {
    if (!frameHandle && canRun()) frameHandle = requestAnimationFrame(frame);
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      cancelFrame();
      return;
    }
    dirty = true;
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]?.isIntersecting ?? false;
    if (!onScreen) {
      cancelFrame();
      return;
    }
    dirty = true;
    schedule();
  });
  intersection.observe(canvas);

  const resizeObserver = new ResizeObserver(() => {
    dirty = true;
    if (options.reduce) draw(true);
    else schedule();
  });
  resizeObserver.observe(canvas);

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.addEventListener("load", () => {
    if (destroyed) return;
    aspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
    texture = loadTexture(gl, image);
    dirty = true;
    if (options.reduce) draw(true);
    else schedule();
  });
  image.src = src;

  return {
    redraw() {
      dirty = true;
      draw(true);
    },
    destroy() {
      destroyed = true;
      cancelFrame();
      document.removeEventListener("visibilitychange", onVisibility);
      intersection.disconnect();
      resizeObserver.disconnect();
      if (texture) gl.deleteTexture(texture);
      quad.dispose();
      gl.deleteProgram(program);
    },
  };
}
