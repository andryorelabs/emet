/**
 * Resolves a portrait from a coarse pixel mosaic into the full image on a
 * canvas laid over the `<img>`. Under reduced motion, without a 2D context or
 * before the image decodes, the canvas stays hidden and the image shows.
 */

export interface PixelRevealOptions {
  durationMs: number;
  reduce: boolean;
}

export interface PixelReveal {
  destroy(): void;
}

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const MIN_CELL = 18;
const CELLS_ACROSS = 22;
const REVEAL_OVERSHOOT = 1.25;
const MAX_PIXEL_RATIO = 2;
const VISIBLE_THRESHOLD = 0.25;

/** The centred source window that covers a canvas of `cw` by `ch`, like `object-fit: cover`. */
export function coverRect(iw: number, ih: number, cw: number, ch: number): SourceRect {
  const imageRatio = iw / ih;
  const canvasRatio = cw / ch;
  if (canvasRatio > imageRatio) {
    const sh = iw / canvasRatio;
    return { sx: 0, sy: (ih - sh) / 2, sw: iw, sh };
  }
  const sw = ih * canvasRatio;
  return { sx: (iw - sw) / 2, sy: 0, sw, sh: ih };
}

/** Side of one mosaic cell for a canvas `width` pixels wide. */
export function cellSize(width: number): number {
  return Math.max(MIN_CELL, Math.round(width / CELLS_ACROSS));
}

/** A fixed pseudo-random threshold per cell, so each frame reveals a stable set. */
export function cellThresholds(count: number): number[] {
  let seed = 0x9e3779b9;
  const thresholds: number[] = [];
  for (let index = 0; index < count; index++) {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39;
    thresholds.push(((seed >>> 0) % 10_000) / 10_000);
  }
  return thresholds;
}

function drawMosaic(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  thresholds: number[],
): void {
  const source = coverRect(image.naturalWidth, image.naturalHeight, width, height);
  if (progress >= 1) {
    context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
    return;
  }
  const cell = cellSize(width);
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, columns, rows);
  context.imageSmoothingEnabled = false;
  context.drawImage(context.canvas, 0, 0, columns, rows, 0, 0, columns * cell, rows * cell);
  context.imageSmoothingEnabled = true;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if ((thresholds[row * columns + column] ?? 1) >= progress * REVEAL_OVERSHOOT) continue;
      context.drawImage(
        image,
        source.sx + ((column * cell) / width) * source.sw,
        source.sy + ((row * cell) / height) * source.sh,
        (cell / width) * source.sw,
        (cell / height) * source.sh,
        column * cell,
        row * cell,
        cell,
        cell,
      );
    }
  }
}

/** Starts the reveal once the canvas is a quarter in view; pauses off-screen and on a hidden tab. */
export function initPixelReveal(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  options: PixelRevealOptions,
): PixelReveal {
  const context = options.reduce ? null : canvas.getContext("2d");
  if (!context) return { destroy: () => undefined };
  const drawing = context;

  let ready = false;
  let visible = false;
  let finished = false;
  let elapsed = 0;
  let lastTime = 0;
  let frame = 0;
  let thresholds: number[] = [];

  function progress(): number {
    return Math.min(1, elapsed / options.durationMs);
  }

  function paint(): void {
    const ratio = Math.min(MAX_PIXEL_RATIO, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const cell = cellSize(width);
    const count = Math.ceil(width / cell) * Math.ceil(height / cell);
    if (thresholds.length !== count) thresholds = cellThresholds(count);
    drawMosaic(drawing, image, width, height, progress(), thresholds);
  }

  function step(now: number): void {
    frame = 0;
    elapsed += now - lastTime;
    lastTime = now;
    paint();
    if (progress() >= 1) {
      finished = true;
      canvas.dataset.state = "done";
      return;
    }
    frame = requestAnimationFrame(step);
  }

  function sync(): void {
    const running = ready && visible && !finished && !document.hidden;
    if (running && frame === 0) {
      lastTime = performance.now();
      frame = requestAnimationFrame(step);
    } else if (!running && frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function onReady(): void {
    if (ready) return;
    ready = true;
    paint();
    canvas.dataset.state = "ready";
    sync();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.at(-1)?.isIntersecting ?? false;
      sync();
    },
    { threshold: VISIBLE_THRESHOLD },
  );
  const onResize = (): void => {
    if (ready && !finished) paint();
  };

  observer.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  addEventListener("resize", onResize, { passive: true });
  if (image.complete && image.naturalWidth > 0) onReady();
  else image.addEventListener("load", onReady, { once: true });

  return {
    destroy() {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      removeEventListener("resize", onResize);
      image.removeEventListener("load", onReady);
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
