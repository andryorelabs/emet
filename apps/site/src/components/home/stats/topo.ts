/**
 * Topo Background (kokonutui) - TypeScript port.
 * Source: https://kokonutui.com/r/topo-background.json
 *         (/components/kokonutui/topo-background.tsx, @dorianbaffier, v1.1.0)
 * License: MIT (stated in the file's header comment; the JSON has no license field).
 *
 * Original API (React): <TopoBackground interval speed interactive seed labels>.
 * Defaults kept as constants: interval 0.07, speed 1, interactive true, seed 26,
 * labels true. It draws marching-squares contour lines over seeded 3D Perlin
 * noise on a 2D canvas, a cursor "hill", click ripples, and survey-style
 * elevation labels.
 *
 * Port API: initTopo(canvas, { color, reduce }) -> { destroy() }.
 *
 * Changes: React and cn removed; the noise, marching squares, label and hill
 * code live in noise.ts and contour.ts with their constants kept as in the
 * original. The stroke colour is an option instead of being polled from the
 * computed style. Pointer events and "avoid" label areas use
 * canvas.parentElement as the root (original: the component root). The
 * top/bottom fade mask lives in stats.css. `reduce` replaces matchMedia: one
 * static frame, no listeners. Also pauses off screen and on a hidden tab. Never
 * throws without a 2D context or Path2D (returns a no-op).
 */
import {
  CELL,
  LABEL_BASE,
  LABEL_STEP,
  traceContours,
  type AvoidArea,
  type LabelSlots,
} from "./contour";
import { createNoise } from "./noise";

const INTERVAL = 0.07;
const SEED = 26;
const TERRAIN_SCALE = 360;
const HILL_HEIGHT = 0.5;
const HILL_SPREAD = 120;
const HILL_FOLLOW = 9;
const HILL_RISE = 5;
const RIPPLE_MS = 1800;
const RIPPLE_SPEED = 0.24;
const RIPPLE_WIDTH = 42;
const RIPPLE_HEIGHT = 0.2;
const RIPPLE_WAVELENGTH = 96;
const RIPPLE_LIMIT = 4;
const IDLE_FRAME_MS = 33;
const MAX_FRAME_S = 0.05;
const MAX_DPR = 2;
const DRIFT_SPEED = 6;
const LABEL_FONT = "500 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

export interface TopoOptions {
  color: string;
  reduce: boolean;
}

export interface TopoHandle {
  destroy(): void;
}

interface Hill {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  amount: number;
  on: boolean;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
}

const NOOP_HANDLE: TopoHandle = { destroy: () => undefined };

/** The 2D context when this environment can draw the contours, else null. */
function drawingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof Path2D === "undefined") return null;
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

/** Eases the hill toward the pointer; true while it is still moving. */
function stepHill(hill: Hill, dt: number): boolean {
  const follow = 1 - Math.exp(-HILL_FOLLOW * dt);
  hill.x += (hill.targetX - hill.x) * follow;
  hill.y += (hill.targetY - hill.y) * follow;
  const goal = hill.on ? 1 : 0;
  hill.amount += (goal - hill.amount) * (1 - Math.exp(-HILL_RISE * dt));
  return (
    Math.abs(hill.targetX - hill.x) > 0.5 ||
    Math.abs(hill.targetY - hill.y) > 0.5 ||
    Math.abs(goal - hill.amount) > 0.002
  );
}

/** Draws animated topographic contours on the canvas; the colour and reduced-motion choice come from the caller. */
export function initTopo(canvas: HTMLCanvasElement, options: TopoOptions): TopoHandle {
  const ctx = drawingContext(canvas);
  if (!ctx) return NOOP_HANDLE;

  const root = canvas.parentElement ?? canvas;
  const { color, reduce } = options;
  const noise = createNoise(SEED);

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let field = new Float32Array(0);
  const hill: Hill = { x: 0, y: 0, targetX: 0, targetY: 0, amount: 0, on: false };
  const ripples: Ripple[] = [];
  let time = 0;
  let last = 0;
  let lastPaint = 0;
  let raf = 0;
  let visible = true;
  let destroyed = false;
  const slots: LabelSlots = { drift: 0, width: 0, height: 0, best: new Map(), avoid: [] };

  const measureContent = (): void => {
    const origin = canvas.getBoundingClientRect();
    const avoid: AvoidArea[] = [];
    for (const child of root.children) {
      if (child === canvas || child.contains(canvas)) continue;
      const r = child.getBoundingClientRect();
      avoid.push({
        x0: r.left - origin.left - 16,
        y0: r.top - origin.top - 12,
        x1: r.right - origin.left + 16,
        y1: r.bottom - origin.top + 12,
      });
    }
    slots.avoid = avoid;
  };

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(width / CELL) + 1;
    rows = Math.ceil(height / CELL) + 1;
    field = new Float32Array(cols * rows);
    measureContent();
  };

  const sample = (now: number): void => {
    const z = time * 0.05;
    const drift = time * DRIFT_SPEED;
    const hillOn = hill.amount > 0.001;
    const spread = 2 * HILL_SPREAD * HILL_SPREAD;
    const ringWidth = 2 * RIPPLE_WIDTH * RIPPLE_WIDTH;
    for (let j = 0; j < rows; j++) {
      const y = j * CELL;
      for (let i = 0; i < cols; i++) {
        const x = i * CELL;
        const nx = (x + drift) / TERRAIN_SCALE;
        const ny = y / TERRAIN_SCALE;
        let v = noise(nx, ny, z) * 0.78 + noise(nx * 2.3 + 17.1, ny * 2.3 + 4.7, z * 1.4) * 0.22;
        if (hillOn) {
          const dx = x - hill.x;
          const dy = y - hill.y;
          v += HILL_HEIGHT * hill.amount * Math.exp(-(dx * dx + dy * dy) / spread);
        }
        for (const ripple of ripples) {
          const age = now - ripple.start;
          const d = Math.hypot(x - ripple.x, y - ripple.y) - age * RIPPLE_SPEED;
          const fadeOut = 1 - age / RIPPLE_MS;
          v +=
            RIPPLE_HEIGHT *
            fadeOut *
            fadeOut *
            Math.exp(-(d * d) / ringWidth) *
            Math.cos((d / RIPPLE_WAVELENGTH) * Math.PI * 2);
        }
        field[j * cols + i] = v;
      }
    }
  };

  const drawLabels = (): void => {
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const label of slots.best.values()) {
      const text = String(LABEL_BASE + label.level * LABEL_STEP);
      const w = ctx.measureText(text).width + 8;
      ctx.save();
      ctx.translate(Math.round(label.x), Math.round(label.y));
      ctx.rotate(label.angle);
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.fillRect(-w / 2, -6, w, 12);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.5;
      ctx.fillText(text, 0, 0.5);
      ctx.restore();
    }
  };

  const paint = (now: number): void => {
    sample(now);
    const minor = new Path2D();
    const major = new Path2D();
    slots.best.clear();
    slots.drift = time * DRIFT_SPEED;
    slots.width = width;
    slots.height = height;
    traceContours(field, { cols, rows }, INTERVAL, { minor, major, slots });
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 0.75;
    ctx.stroke(minor);
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = 1.1;
    ctx.stroke(major);
    drawLabels();
    ctx.globalAlpha = 1;
  };

  const frame = (now: number): void => {
    raf = 0;
    if (!visible || destroyed) return;
    const dt = last ? Math.min((now - last) / 1000, MAX_FRAME_S) : 0;
    last = now;
    const hillMoving = stepHill(hill, dt);
    while (ripples.length > 0 && now - (ripples[0]?.start ?? now) > RIPPLE_MS) ripples.shift();
    const settling = hillMoving || ripples.length > 0;
    time += dt;
    if (settling || now - lastPaint >= IDLE_FRAME_MS) {
      paint(now);
      lastPaint = now;
    }
    raf = requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (raf || !visible || reduce || destroyed) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  resize();
  paint(performance.now());
  start();

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          resize();
          paint(performance.now());
        });
  resizeObserver?.observe(canvas);

  let onScreen = true;
  const updateVisible = (): void => {
    visible = onScreen && !document.hidden;
    if (visible) start();
  };
  const intersection =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          const latest = entries[entries.length - 1];
          if (latest) onScreen = latest.isIntersecting;
          updateVisible();
        });
  intersection?.observe(root);
  document.addEventListener("visibilitychange", updateVisible);

  const local = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") return;
    const point = local(event);
    if (!hill.on) {
      hill.x = point.x;
      hill.y = point.y;
    }
    hill.targetX = point.x;
    hill.targetY = point.y;
    hill.on = true;
    start();
  };
  const onLeave = (): void => {
    hill.on = false;
    start();
  };
  const onDown = (event: PointerEvent): void => {
    if (event.target instanceof Element && event.target.closest("a, button, input, textarea")) {
      return;
    }
    const point = local(event);
    ripples.push({ ...point, start: performance.now() });
    if (ripples.length > RIPPLE_LIMIT) ripples.shift();
    start();
  };
  if (!reduce) {
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
  }

  return {
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver?.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", updateVisible);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
    },
  };
}
