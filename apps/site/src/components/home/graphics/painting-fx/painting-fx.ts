import { coverGeometry } from "./cover-geometry";
import { fxEnabled } from "./enable";
import { blink, createEyeState, gazeTargets, glow, stepEyes } from "./eyes";
import { createEyesLayer, createWaterLayer, probeWebgl } from "./layers";
import type { EyesLayer, WaterLayer } from "./layers";
import { cloudTransform, eyeRegion, placeRect, skyMaskGradient } from "./layout";
import type { CoverGeometry } from "./layout";
import type { PaintingFxHandle, PaintingFxOptions, Rect } from "./types";

const MAX_DEVICE_PIXEL_RATIO = 2;

const NOOP_HANDLE: PaintingFxHandle = {
  blink: () => undefined,
  glow: () => undefined,
  destroy: () => undefined,
};

/** Which effects are drawing right now; each one replaces its CSS Valley layer. */
interface FxActive {
  readonly clouds: boolean;
  readonly water: boolean;
  readonly eyes: boolean;
}

/** Sets or clears one `data-fx-*` marker attribute on the host. */
function toggleMarker(host: HTMLElement, attribute: string, on: boolean): void {
  if (on) host.setAttribute(attribute, "");
  else host.removeAttribute(attribute);
}

/** Mirrors the active effects onto the host so `graphics.css` hides only the Valley layers that were replaced. */
function setFxMarkers(host: HTMLElement, active: FxActive): void {
  const any = active.clouds || active.water || active.eyes;
  if (any) host.dataset.fx = "on";
  else delete host.dataset.fx;
  toggleMarker(host, "data-fx-clouds", active.clouds);
  toggleMarker(host, "data-fx-water", active.water);
  toggleMarker(host, "data-fx-eyes", active.eyes);
}

function overlayElement<K extends "div" | "canvas">(tag: K): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  element.style.setProperty("position", "absolute");
  element.style.setProperty("pointer-events", "none");
  return element;
}

function placeElement(element: HTMLElement, box: Rect): void {
  element.style.setProperty("left", `${box.x}px`);
  element.style.setProperty("top", `${box.y}px`);
  element.style.setProperty("width", `${box.width}px`);
  element.style.setProperty("height", `${box.height}px`);
}

function readEnv(): Parameters<typeof fxEnabled>[0] {
  return {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    webgl: probeWebgl(),
  };
}

/**
 * Lays living effects over the painting `<img>` inside `host`: a masked sky
 * copy that drifts (clouds), a river flow-map shader (water) and an eyes warp
 * shader with gaze, blink and glow. Nothing is built, and `data-fx` is never
 * set, for reduced motion, small or coarse-pointer viewers and missing WebGL,
 * so the CSS Valley stays. Work starts when the host is on screen and stops
 * when it is off screen or the tab is hidden.
 */
export function paintingFx(host: HTMLElement, options: PaintingFxOptions): PaintingFxHandle {
  const found = host.querySelector("img");
  if (!found || !fxEnabled(readEnv())) return NOOP_HANDLE;
  const image: HTMLImageElement = found;

  const { painting, effects } = options;
  const eyeScale = options.eyeScale ?? painting.eyeScale;
  const skyMask = options.skyMask ?? painting.skyMask;
  const objectPosition = options.objectPosition ?? painting.objectPosition;
  const eyeState = createEyeState();

  const sky = overlayElement("div");
  sky.style.setProperty("inset", "0");
  sky.style.setProperty("overflow", "hidden");
  const skyImage = new Image();
  skyImage.alt = "";
  skyImage.src = image.currentSrc || image.src;
  const imageStyle = getComputedStyle(image);
  skyImage.style.setProperty("position", "absolute");
  skyImage.style.setProperty("inset", "0");
  skyImage.style.setProperty("width", "100%");
  skyImage.style.setProperty("height", "100%");
  skyImage.style.setProperty("object-fit", "cover");
  skyImage.style.setProperty(
    "object-position",
    `${objectPosition[0] * 100}% ${objectPosition[1] * 100}%`,
  );
  skyImage.style.setProperty("filter", imageStyle.filter || "none");
  sky.append(skyImage);
  const waterCanvas = overlayElement("canvas");
  const eyesCanvas = overlayElement("canvas");
  image.after(sky, waterCanvas, eyesCanvas);

  let geometry: CoverGeometry = { scale: 1, offsetX: 0, offsetY: 0 };
  let hostWidth = 0;
  let water: WaterLayer | null = null;
  let eyes: EyesLayer | null = null;
  let waterFailed = false;
  let eyesFailed = false;
  let visible = false;
  let destroyed = false;
  let frameId = 0;
  let fxStart: number | null = null;

  function layout(): void {
    hostWidth = host.clientWidth;
    geometry = coverGeometry(
      painting.size,
      { width: hostWidth, height: host.clientHeight },
      objectPosition,
    );
    const gradient = skyMaskGradient(painting.size, geometry, skyMask);
    sky.style.setProperty("mask-image", gradient);
    sky.style.setProperty("-webkit-mask-image", gradient);
    if (painting.waterRegion) placeElement(waterCanvas, placeRect(painting.waterRegion, geometry));
    placeElement(eyesCanvas, placeRect(eyeRegion(painting.eyes, eyeScale), geometry));
  }

  function ready(): boolean {
    return image.complete && image.naturalWidth > 0;
  }

  function loseWater(): void {
    waterFailed = true;
    water = null;
    waterCanvas.hidden = true;
  }

  function loseEyes(): void {
    eyesFailed = true;
    eyes = null;
    eyesCanvas.hidden = true;
  }

  function drawWater(nowMs: number): boolean {
    if (!effects.water || waterFailed || !painting.waterRegion || !ready()) return false;
    if (!water) {
      water = createWaterLayer({ canvas: waterCanvas, image, painting, onLost: loseWater });
      if (!water) waterFailed = true;
    }
    if (!water) return false;
    water.setTime(nowMs);
    water.draw(geometry.scale);
    return true;
  }

  function drawEyes(nowMs: number): boolean {
    if (!effects.eyes || eyesFailed || !ready()) return false;
    if (!eyes) {
      eyes = createEyesLayer({ canvas: eyesCanvas, image, painting, onLost: loseEyes }, eyeScale);
      if (!eyes) eyesFailed = true;
    }
    if (!eyes) return false;
    const gaze = options.gaze?.() ?? null;
    const targets = gazeTargets(painting.eyes, gaze ? [gaze.x, gaze.y] : null, geometry, eyeScale);
    eyes.setFrame(stepEyes(eyeState, targets, nowMs));
    eyes.draw(geometry.scale * Math.min(devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO));
    return true;
  }

  function render(nowMs: number): void {
    if (options.when && !options.when()) {
      fxStart = null;
      sky.hidden = true;
      waterCanvas.hidden = true;
      eyesCanvas.hidden = true;
      setFxMarkers(host, { clouds: false, water: false, eyes: false });
      return;
    }
    fxStart ??= nowMs;
    const clouds = effects.clouds === true;
    sky.hidden = !clouds;
    if (clouds) {
      const skySource = image.currentSrc || image.src;
      if (ready() && skyImage.src !== skySource) skyImage.src = skySource;
      sky.style.setProperty("transform", cloudTransform(nowMs - fxStart, hostWidth));
    }
    const waterDrawn = drawWater(nowMs);
    const eyesDrawn = drawEyes(nowMs);
    waterCanvas.hidden = !waterDrawn;
    eyesCanvas.hidden = !eyesDrawn;
    setFxMarkers(host, { clouds, water: waterDrawn, eyes: eyesDrawn });
  }

  function shouldRun(): boolean {
    return !destroyed && visible && !document.hidden;
  }

  function frame(nowMs: number): void {
    frameId = 0;
    if (!shouldRun()) return;
    render(nowMs);
    schedule();
  }

  function schedule(): void {
    if (frameId === 0 && shouldRun()) frameId = requestAnimationFrame(frame);
  }

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);
  layout();
  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries.at(-1)?.isIntersecting ?? false;
    schedule();
  });
  intersectionObserver.observe(host);
  document.addEventListener("visibilitychange", schedule);

  return {
    blink() {
      blink(eyeState, performance.now());
    },
    glow() {
      glow(eyeState, performance.now());
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      water?.dispose();
      eyes?.dispose();
      sky.remove();
      waterCanvas.remove();
      eyesCanvas.remove();
      setFxMarkers(host, { clouds: false, water: false, eyes: false });
    },
  };
}
