import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import {
  drawLanes,
  type LaneContext,
  initLanes,
  LANES_REFRESH_EVENT,
  laneDots,
  readLaneLabels,
} from "./lanes";

describe("laneDots", () => {
  test("lights no dot at the start of the sweep", () => {
    const { lanes } = laneDots(0, false);
    expect(lanes).toHaveLength(3);
    expect(lanes.flatMap((lane) => lane.dots).some((dot) => dot.lit)).toBe(false);
  });

  test("lights every dot at the end of the sweep", () => {
    const { lanes } = laneDots(1.4, false);
    expect(lanes.flatMap((lane) => lane.dots).every((dot) => dot.lit)).toBe(true);
  });

  test("lights the first dots first and lags each lane a little", () => {
    const { lanes } = laneDots(0.3, false);
    expect(lanes[0]?.dots.map((dot) => dot.lit)).toEqual([true, true, false, false, false, false]);
    expect(lanes[2]?.dots.map((dot) => dot.lit)).toEqual([true, false, false, false, false, false]);
    expect(laneDots(0.14, false).lanes[0]?.dots[0]?.lit).toBe(true);
    expect(laneDots(0.14, false).lanes[2]?.dots[0]?.lit).toBe(false);
  });

  test("holds only lane three when held", () => {
    expect(laneDots(1, true).lanes.map((lane) => lane.held)).toEqual([false, false, true]);
    expect(laneDots(1, false).lanes.map((lane) => lane.held)).toEqual([false, false, false]);
  });
});

class Recorder implements LaneContext {
  calls: string[] = [];
  dashes: number[][] = [];
  fills: (string | CanvasGradient | CanvasPattern)[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  font = "";
  texts: { text: string; x: number; y: number }[] = [];
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  lineWidth = 1;
  arc(): void {
    this.calls.push("arc");
  }
  beginPath(): void {
    this.calls.push("beginPath");
  }
  bezierCurveTo(): void {
    this.calls.push("bezierCurveTo");
  }
  clearRect(): void {
    this.calls.push("clearRect");
  }
  fill(): void {
    this.fills.push(this.fillStyle);
  }
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y });
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  setLineDash(segments: number[]): void {
    this.dashes.push(segments);
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  strokeRect(): void {
    this.calls.push("strokeRect");
  }
}

function recorder(): Recorder {
  return new Recorder();
}

describe("drawLanes", () => {
  const size = { width: 300, height: 140, scale: 1 };

  test("draws the merged state with solid lanes and a teal node", () => {
    const rec = recorder();
    drawLanes(rec, size, laneDots(1.4, false), false);
    expect(rec.calls).toContain("clearRect");
    expect(rec.calls).toContain("strokeRect");
    expect(rec.fills.at(-1)).toBe("oklch(0.85 0.1 182)");
    expect(rec.dashes.some((dash) => dash.length === 2 && dash[0] === 6)).toBe(false);
  });

  test("dashes lane three and turns the node amber", () => {
    const rec = recorder();
    drawLanes(rec, size, laneDots(1.4, true), true);
    expect(rec.fills.at(-1)).toBe("oklch(0.76 0.15 80)");
    expect(rec.dashes.filter((dash) => dash.length === 2 && dash[0] === 6)).toHaveLength(1);
  });
});

describe("lane labels", () => {
  const size = { width: 300, height: 140, scale: 2 };

  test("writes review above the gate and merged beside the node", () => {
    const rec = recorder();
    drawLanes(rec, size, laneDots(1.4, false), false, {
      review: "review",
      merged: "merged",
      held: "held",
      family: "JetBrains Mono",
    });
    expect(rec.texts).toEqual([
      { text: "review", x: 0.46 * 300, y: 14 * 2 },
      { text: "merged", x: 0.8 * 300 + 24, y: 0.88 * 140 + 8 },
    ]);
    expect(rec.font).toBe("24px JetBrains Mono");
  });

  test("writes held instead of merged while held", () => {
    const rec = recorder();
    drawLanes(rec, size, laneDots(1.4, true), true, { held: "held", merged: "merged" });
    expect(rec.texts.map((entry) => entry.text)).toEqual(["held"]);
    expect(rec.font).toBe("24px monospace");
  });

  test("keeps the review word above a tall gate and draws nothing without words", () => {
    const tall = recorder();
    drawLanes(tall, { width: 300, height: 600, scale: 1 }, laneDots(1, false), false, {
      review: "review",
    });
    expect(tall.texts[0]?.y).toBe(0.04 * 600 - 6);
    const bare = recorder();
    drawLanes(bare, size, laneDots(1, false), false);
    expect(bare.texts).toEqual([]);
  });
});

function drawCount(rec: Recorder): number {
  return rec.calls.filter((call) => call === "clearRect").length;
}

const frames: FrameRequestCallback[] = [];
const cancelled: number[] = [];
const observers: FakeObserver[] = [];
let held = false;

class FakeObserver {
  readonly callback: (entries: { isIntersecting: boolean }[]) => void;
  disconnected = false;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback;
    observers.push(this);
  }
  observe(): void {
    this.observed = true;
  }
  observed = false;
  disconnect(): void {
    this.disconnected = true;
  }
  set(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }]);
  }
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function makeCanvas(rec: Recorder | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", { value: () => rec, configurable: true });
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 320, 140);
  return canvas;
}

function setHidden(value: boolean): void {
  Object.defineProperty(document, "hidden", { value, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("initLanes", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    define("cancelAnimationFrame", (id: number) => {
      cancelled.push(id);
    });
    define("IntersectionObserver", FakeObserver);
    define("devicePixelRatio", 3);
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    frames.length = 0;
    cancelled.length = 0;
    observers.length = 0;
    held = false;
    setHidden(false);
  });

  test("returns a no-op handle without a 2d context", () => {
    expect(() => {
      initLanes(makeCanvas(null), { reduce: false, isHeld: () => held }).destroy();
    }).not.toThrow();
    expect(frames).toHaveLength(0);
  });

  test("reduced motion draws one final frame and redraws on refresh and resize", () => {
    const rec = recorder();
    const canvas = makeCanvas(rec);
    const handle = initLanes(canvas, { reduce: true, isHeld: () => held });
    expect(drawCount(rec)).toBe(1);
    expect(rec.fills.at(-1)).toBe("oklch(0.85 0.1 182)");
    expect(canvas.width).toBe(640);
    expect(frames).toHaveLength(0);
    held = true;
    canvas.dispatchEvent(new Event(LANES_REFRESH_EVENT));
    expect(rec.fills.at(-1)).toBe("oklch(0.76 0.15 80)");
    const before = drawCount(rec);
    globalThis.dispatchEvent(new Event("resize"));
    expect(drawCount(rec)).toBe(before + 1);
    handle.destroy();
    canvas.dispatchEvent(new Event(LANES_REFRESH_EVENT));
    expect(drawCount(rec)).toBe(before + 1);
  });

  test("animates only while visible and the tab is shown", () => {
    const rec = recorder();
    initLanes(makeCanvas(rec), { reduce: false, isHeld: () => held });
    expect(frames).toHaveLength(0);
    const observer = observers[0];
    observer?.set(true);
    expect(frames).toHaveLength(1);
    frames.shift()?.(1300);
    expect(drawCount(rec)).toBe(1);
    expect(rec.fills.at(-1)).toBe("oklch(0.85 0.1 182)");
    expect(frames).toHaveLength(1);
    observer?.set(true);
    expect(frames).toHaveLength(1);
    setHidden(true);
    expect(cancelled).toHaveLength(1);
    setHidden(false);
    expect(frames).toHaveLength(2);
    observer?.set(false);
    expect(cancelled).toHaveLength(2);
    observer?.set(false);
    expect(cancelled).toHaveLength(2);
  });

  test("idles while the active gate is closed and resumes when it reopens", () => {
    const rec = recorder();
    const canvas = makeCanvas(rec);
    let active = false;
    initLanes(canvas, { reduce: false, isHeld: () => held, isActive: () => active });
    observers[0]?.set(true);
    expect(frames).toHaveLength(0);
    active = true;
    canvas.dispatchEvent(new Event(LANES_REFRESH_EVENT));
    expect(frames).toHaveLength(1);
    active = false;
    canvas.dispatchEvent(new Event(LANES_REFRESH_EVENT));
    expect(cancelled).toHaveLength(1);
  });

  test("measures on start and resize, not on every frame", () => {
    const rec = recorder();
    const canvas = makeCanvas(rec);
    let measures = 0;
    canvas.getBoundingClientRect = () => {
      measures += 1;
      return new DOMRect(0, 0, 320, 140);
    };
    const handle = initLanes(canvas, { reduce: false, isHeld: () => held });
    expect(measures).toBe(1);
    observers[0]?.set(true);
    expect(measures).toBe(2);
    frames.shift()?.(100);
    frames.shift()?.(200);
    expect(measures).toBe(2);
    globalThis.dispatchEvent(new Event("resize"));
    expect(measures).toBe(3);
    handle.destroy();
    globalThis.dispatchEvent(new Event("resize"));
    expect(measures).toBe(3);
  });

  test("destroy stops the loop and disconnects the observer", () => {
    const rec = recorder();
    const handle = initLanes(makeCanvas(rec), { reduce: false, isHeld: () => held });
    observers[0]?.set(true);
    handle.destroy();
    expect(observers[0]?.disconnected).toBe(true);
    expect(cancelled).toHaveLength(1);
    setHidden(true);
    setHidden(false);
    expect(frames).toHaveLength(1);
  });
});

describe("readLaneLabels", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });
  afterAll(() => GlobalRegistrator.unregister());

  test("reads lowercase words and the mono family from the canvas", () => {
    const canvas = document.createElement("canvas");
    canvas.dataset.labelReview = "Review";
    canvas.dataset.labelMerged = "Merged";
    canvas.style.fontFamily = "Mono";
    document.body.append(canvas);
    expect(readLaneLabels(canvas)).toEqual({
      review: "review",
      merged: "merged",
      held: undefined,
      family: "Mono",
    });
  });

  test("falls back to no family when the canvas has none", () => {
    expect(readLaneLabels(document.createElement("canvas")).family).toBeUndefined();
  });
});
