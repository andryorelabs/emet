/**
 * The git-lanes canvas of the showcase: three lanes of worker dots pass a
 * review gate and merge into one node. A held ticket dashes lane three and
 * turns the node amber. The loop runs only while the canvas is on screen
 * and the tab is visible; reduced motion draws one static frame.
 */

interface LaneDot {
  /** Position along the lane before the gate, 0..1. */
  at: number;
  lit: boolean;
}

interface Lane {
  /** Vertical position as a fraction of the canvas height. */
  y: number;
  held: boolean;
  dots: LaneDot[];
}

export interface LaneFrame {
  lanes: Lane[];
}

export interface CanvasSize {
  width: number;
  height: number;
  scale: number;
}

export interface LaneOptions {
  reduce: boolean;
  isHeld: () => boolean;
  /** Optional gate: the loop idles while it returns false, e.g. an invisible panel. */
  isActive?: () => boolean;
}

/** The drawing surface the lanes need, so tests can pass a recording fake. */
export type LaneContext = Pick<
  CanvasRenderingContext2D,
  | "arc"
  | "beginPath"
  | "bezierCurveTo"
  | "clearRect"
  | "fill"
  | "fillStyle"
  | "fillText"
  | "font"
  | "lineTo"
  | "lineWidth"
  | "moveTo"
  | "setLineDash"
  | "stroke"
  | "strokeRect"
  | "strokeStyle"
>;

const LANE_Y = [0.14, 0.36, 0.58];
const DOT_STOPS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
const HELD_LANE = 2;
const SWEEP_MS = 2600;
const SWEEP_LENGTH = 1.4;
const START_X = 0.04;
const GATE_X = 0.5;
const MERGE_X = 0.8;
const END_X = 0.97;
const MERGE_Y = 0.88;

/**
 * Canvas palette, drawn over the dark glass panel in both themes so it stays
 * constant: moss lane, warn held lane, lamp dots, a soft white rail, a teal
 * merged node and a soft white label ink.
 */
const PALETTE = {
  lane: "oklch(0.74 0.13 135)",
  held: "oklch(0.76 0.15 80)",
  lit: "oklch(0.9 0.14 95)",
  idle: "oklch(1 0 0 / .3)",
  rail: "oklch(1 0 0 / .28)",
  merged: "oklch(0.85 0.1 182)",
  label: "oklch(1 0 0 / .7)",
};

const LABEL_SIZE = 12;
const FALLBACK_FAMILY = "monospace";

/** The words the canvas writes beside the gate and the merge node; a missing word is not drawn. */
export interface LaneLabels {
  review?: string | undefined;
  merged?: string | undefined;
  held?: string | undefined;
  /** CSS font family the words are set in. */
  family?: string | undefined;
}

/** Reads the lane words from the canvas `data-label-*` attributes, set from the page strings. */
export function readLaneLabels(canvas: HTMLElement): LaneLabels {
  const lang = document.documentElement.lang;
  const word = (name: string): string | undefined =>
    nonBlank(canvas.dataset[name]?.toLocaleLowerCase(lang === "" ? undefined : lang));
  return {
    review: word("labelReview"),
    merged: word("labelMerged"),
    held: word("labelHeld"),
    family: nonBlank(getComputedStyle(canvas).fontFamily.trim()),
  };
}

function nonBlank(text: string | undefined): string | undefined {
  return text === "" ? undefined : text;
}

/** Event the showcase dispatches on the canvas when the held state changes. */
export const LANES_REFRESH_EVENT = "showcase:refresh";

/**
 * The lane dots for a sweep progress, where progress runs 0..1.4 and a dot
 * lights once the head passes it. Lane three is held when `held` is set.
 */
export function laneDots(progress: number, held: boolean): LaneFrame {
  return {
    lanes: LANE_Y.map((y, index) => ({
      y,
      held: held && index === HELD_LANE,
      dots: DOT_STOPS.map((at) => ({ at, lit: progress > at * 0.9 + index * 0.04 })),
    })),
  };
}

function drawLane(context: LaneContext, lane: Lane, size: CanvasSize): void {
  const { width, height, scale } = size;
  const y = lane.y * height;
  const startX = START_X * width;
  const gateX = GATE_X * width;
  const mergeX = MERGE_X * width;
  context.lineWidth = 2 * scale;
  context.strokeStyle = lane.held ? PALETTE.held : PALETTE.lane;
  context.beginPath();
  context.moveTo(startX, y);
  context.lineTo(gateX, y);
  context.stroke();
  context.beginPath();
  context.moveTo(gateX, y);
  context.bezierCurveTo(
    gateX + 0.15 * width,
    y,
    mergeX - 0.1 * width,
    MERGE_Y * height,
    mergeX,
    MERGE_Y * height,
  );
  context.setLineDash(lane.held ? [6 * scale, 6 * scale] : []);
  context.stroke();
  context.setLineDash([]);
  for (const dot of lane.dots) {
    context.fillStyle = dot.lit ? PALETTE.lit : PALETTE.idle;
    context.beginPath();
    context.arc(startX + (gateX - startX) * dot.at, y, 4 * scale, 0, Math.PI * 2);
    context.fill();
  }
}

/** Draws one frame: the lanes, the dashed review gate and the merge node. */
export function drawLanes(
  context: LaneContext,
  size: CanvasSize,
  frame: LaneFrame,
  held: boolean,
  labels: LaneLabels = {},
): void {
  const { width, height, scale } = size;
  const mergeY = MERGE_Y * height;
  context.clearRect(0, 0, width, height);
  for (const lane of frame.lanes) drawLane(context, lane, size);
  context.strokeStyle = PALETTE.rail;
  context.lineWidth = 2 * scale;
  context.beginPath();
  context.moveTo(START_X * width, mergeY);
  context.lineTo(END_X * width, mergeY);
  context.stroke();
  context.strokeStyle = PALETTE.lit;
  context.setLineDash([5 * scale, 5 * scale]);
  context.strokeRect(0.46 * width, 0.04 * height, 0.08 * width, 0.62 * height);
  context.setLineDash([]);
  context.font = `${LABEL_SIZE * scale}px ${labels.family ?? FALLBACK_FAMILY}`;
  context.fillStyle = PALETTE.label;
  const gateTop = 0.04 * height;
  const reviewY = gateTop - 6 * scale < LABEL_SIZE * scale ? 14 * scale : gateTop - 6 * scale;
  if (labels.review) context.fillText(labels.review, 0.46 * width, reviewY);
  context.fillStyle = held ? PALETTE.held : PALETTE.merged;
  context.beginPath();
  context.arc(MERGE_X * width, mergeY, 7 * scale, 0, Math.PI * 2);
  context.fill();
  const outcome = held ? labels.held : labels.merged;
  if (outcome) context.fillText(outcome, MERGE_X * width + 12 * scale, mergeY + 4 * scale);
}

/**
 * Starts the lanes on a canvas and returns a handle that stops them. Motion
 * runs only while the canvas intersects the viewport and the tab is visible;
 * with `reduce` one final frame is drawn and redrawn on resize or on
 * `LANES_REFRESH_EVENT`.
 */
export function initLanes(canvas: HTMLCanvasElement, options: LaneOptions): { destroy(): void } {
  const context = canvas.getContext("2d");
  if (!context) return { destroy: () => undefined };
  const isActive = options.isActive ?? (() => true);
  let visible = false;
  let frameId = 0;
  let scale = 1;
  const labels = readLaneLabels(canvas);

  const measure = (): void => {
    scale = Math.min(globalThis.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * scale));
    canvas.height = Math.max(1, Math.round(box.height * scale));
  };

  const draw = (time: number): void => {
    const held = options.isHeld();
    const progress = options.reduce ? SWEEP_LENGTH : (time / SWEEP_MS) % SWEEP_LENGTH;
    const size = { width: canvas.width, height: canvas.height, scale };
    drawLanes(context, size, laneDots(progress, held), held, labels);
  };

  measure();

  if (options.reduce) {
    const refresh = (): void => {
      draw(0);
    };
    const resize = (): void => {
      measure();
      draw(0);
    };
    refresh();
    canvas.addEventListener(LANES_REFRESH_EVENT, refresh);
    globalThis.addEventListener("resize", resize);
    return {
      destroy(): void {
        canvas.removeEventListener(LANES_REFRESH_EVENT, refresh);
        globalThis.removeEventListener("resize", resize);
      },
    };
  }

  const tick = (time: number): void => {
    draw(time);
    frameId = requestAnimationFrame(tick);
  };

  const sync = (): void => {
    const running = visible && !document.hidden && isActive();
    if (running && !frameId) {
      measure();
      frameId = requestAnimationFrame(tick);
    }
    if (!running && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  });
  observer.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener(LANES_REFRESH_EVENT, sync);
  globalThis.addEventListener("resize", measure);
  return {
    destroy(): void {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener(LANES_REFRESH_EVENT, sync);
      globalThis.removeEventListener("resize", measure);
      visible = false;
      sync();
    },
  };
}
