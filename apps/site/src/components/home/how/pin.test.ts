import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { DitherImage, DitherImageOptions } from "../graphics/dither-image";
import { ditherProgress, DITHER_PALETTE, howStep, initHowPin, pinProgress, stepState } from "./pin";

const MARKUP = `
<section data-how-pin>
  <article class="step"></article><article class="step"></article><article class="step"></article>
  <figure data-how-stage><canvas data-dither-src="/source.webp"></canvas><svg data-streams></svg></figure>
</section>`;

interface Harness {
  wide: boolean;
  reduced: boolean;
  top: number;
  height: number;
  changeHandlers: (() => void)[];
  frames: FrameRequestCallback[];
}

const harness: Harness = {
  wide: true,
  reduced: false,
  top: 0,
  height: 4200,
  changeHandlers: [],
  frames: [],
};

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function install(): void {
  define("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("reduced-motion") ? harness.reduced : harness.wide;
    },
    addEventListener: (_type: string, handler: () => void) => {
      harness.changeHandlers.push(handler);
    },
  }));
  define("requestAnimationFrame", (callback: FrameRequestCallback) => {
    harness.frames.push(callback);
    return harness.frames.length;
  });
  define("cancelAnimationFrame", () => {
    harness.frames = [];
  });
  define("innerHeight", 900);
}

function runFrames(): void {
  const pending = harness.frames;
  harness.frames = [];
  for (const callback of pending) callback(0);
}

function root(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-how-pin]");
  if (!element) throw new Error("missing runway");
  element.getBoundingClientRect = () => new DOMRect(0, harness.top, 0, harness.height);
  return element;
}

function states(): (string | undefined)[] {
  return [...document.querySelectorAll<HTMLElement>(".step")].map((step) => step.dataset.stepState);
}

interface FakeDither {
  created: number;
  destroyed: number;
  options: DitherImageOptions | undefined;
  result: DitherImage | null;
}

function fakeDither(returnNull = false): [FakeDither, () => DitherImage | null] {
  const record: FakeDither = { created: 0, destroyed: 0, options: undefined, result: null };
  const handle: DitherImage = {
    redraw: () => undefined,
    destroy: () => {
      record.destroyed += 1;
    },
  };
  record.result = returnNull ? null : handle;
  return [
    record,
    () => {
      record.created += 1;
      return record.result;
    },
  ];
}

describe("howStep", () => {
  test("switches at 0.3 and 0.62", () => {
    expect(howStep(0)).toBe(0);
    expect(howStep(0.29)).toBe(0);
    expect(howStep(0.3)).toBe(1);
    expect(howStep(0.61)).toBe(1);
    expect(howStep(0.62)).toBe(2);
    expect(howStep(1)).toBe(2);
  });
});

describe("pinProgress", () => {
  test("is the scrolled share of the runway travel", () => {
    expect(pinProgress(0, 3780, 900)).toBe(0);
    expect(pinProgress(-1440, 3780, 900)).toBeCloseTo(0.5);
    expect(pinProgress(-9000, 3780, 900)).toBe(1);
    expect(pinProgress(200, 3780, 900)).toBe(0);
  });

  test("is 1 when the runway is no taller than the viewport", () => {
    expect(pinProgress(0, 900, 900)).toBe(1);
  });
});

describe("ditherProgress", () => {
  test("is eased from 0 at 0.1 to 1 at 0.85", () => {
    expect(ditherProgress(0)).toBe(0);
    expect(ditherProgress(0.1)).toBe(0);
    expect(ditherProgress(0.475)).toBeCloseTo(0.5);
    expect(ditherProgress(0.85)).toBe(1);
    expect(ditherProgress(1)).toBe(1);
  });

  test("is monotonic", () => {
    let previous = 0;
    for (let progress = 0; progress <= 1; progress += 0.05) {
      const value = ditherProgress(progress);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("stepState", () => {
  test("marks the active step on, earlier ones done and later ones idle", () => {
    expect([0, 1, 2].map((index) => stepState(index, 1))).toEqual(["done", "on", "idle"]);
    expect([0, 1, 2].map((index) => stepState(index, 2))).toEqual(["done", "done", "on"]);
  });
});

describe("initHowPin", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    harness.wide = true;
    harness.reduced = false;
    harness.top = 0;
    harness.height = 4200;
    harness.changeHandlers = [];
    harness.frames = [];
    document.body.innerHTML = MARKUP;
    install();
  });

  test("pins at 901px and wider and starts on step 0", () => {
    const [record, create] = fakeDither();
    initHowPin(root(), create);
    expect(root().dataset.pinned).toBe("true");
    expect(root().dataset.step).toBe("0");
    expect(states()).toEqual(["on", "idle", "idle"]);
    expect(document.querySelector<HTMLElement>("[data-how-stage]")?.dataset.step).toBe("0");
    expect(document.querySelector<HTMLElement>("[data-streams]")?.dataset.stage).toBe("0");
    expect(record.created).toBe(1);
  });

  test("hands the dither its palette, the source and an eased progress getter", () => {
    const options: DitherImageOptions[] = [];
    initHowPin(root(), (_canvas, src, given) => {
      expect(src).toBe("/source.webp");
      options.push(given);
      return { redraw: () => undefined, destroy: () => undefined };
    });
    const given = options[0];
    expect(given?.palette).toEqual(DITHER_PALETTE);
    expect(given?.reduce).toBe(false);
    expect(given?.getProgress()).toBe(0);

    harness.top = -1440;
    dispatchEvent(new Event("scroll"));
    runFrames();
    expect(given?.getProgress()).toBeCloseTo(ditherProgress(pinProgress(-1440, 4200, 900)));
  });

  test("steps through the timeline as the page scrolls", () => {
    initHowPin(root(), fakeDither()[1]);
    harness.top = -1100;
    dispatchEvent(new Event("scroll"));
    dispatchEvent(new Event("scroll"));
    runFrames();
    expect(states()).toEqual(["done", "on", "idle"]);
    expect(document.querySelector<HTMLElement>("[data-streams]")?.dataset.stage).toBe("1");

    harness.top = -3300;
    dispatchEvent(new Event("resize"));
    runFrames();
    expect(states()).toEqual(["done", "done", "on"]);
    expect(root().dataset.step).toBe("2");

    harness.top = -3301;
    dispatchEvent(new Event("scroll"));
    runFrames();
    expect(root().dataset.step).toBe("2");
  });

  test("hides the dither canvas when WebGL is unavailable", () => {
    initHowPin(root(), fakeDither(true)[1]);
    expect(document.querySelector("canvas")?.hidden).toBe(true);
  });

  test("works without a dither canvas", () => {
    document.querySelector("canvas")?.remove();
    initHowPin(root(), fakeDither()[1]);
    expect(states()).toEqual(["on", "idle", "idle"]);
  });

  test("does nothing with reduced motion", () => {
    harness.reduced = true;
    const [record, create] = fakeDither();
    initHowPin(root(), create);
    expect(root().dataset.pinned).toBeUndefined();
    expect(states()).toEqual([undefined, undefined, undefined]);
    expect(record.created).toBe(0);
  });

  test("does nothing without steps", () => {
    document.querySelectorAll(".step").forEach((step) => {
      step.remove();
    });
    initHowPin(root(), fakeDither()[1]);
    expect(root().dataset.pinned).toBeUndefined();
  });

  test("stays stacked below 901px and pins when the viewport widens", () => {
    harness.wide = false;
    const [record, create] = fakeDither();
    initHowPin(root(), create);
    expect(root().dataset.pinned).toBeUndefined();
    expect(record.created).toBe(0);

    harness.wide = true;
    for (const handler of harness.changeHandlers) handler();
    expect(root().dataset.pinned).toBe("true");
    expect(record.created).toBe(1);
  });

  test("restores the stacked final state when the viewport narrows", () => {
    const [record, create] = fakeDither();
    initHowPin(root(), create);
    harness.wide = false;
    for (const handler of harness.changeHandlers) handler();
    expect(root().dataset.pinned).toBeUndefined();
    expect(root().dataset.step).toBeUndefined();
    expect(states()).toEqual([undefined, undefined, undefined]);
    expect(document.querySelector<HTMLElement>("[data-streams]")?.dataset.stage).toBeUndefined();
    expect(document.querySelector<HTMLElement>("[data-how-stage]")?.dataset.step).toBeUndefined();
    expect(record.destroyed).toBe(1);

    harness.top = -2000;
    dispatchEvent(new Event("scroll"));
    runFrames();
    expect(root().dataset.step).toBeUndefined();
  });
});
