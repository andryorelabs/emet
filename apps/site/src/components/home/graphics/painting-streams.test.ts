import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initPaintingStreams, pickStage } from "./painting-streams";

const MARKUP = `<svg data-streams></svg><article class="exchange"></article><article class="exchange"></article><article class="exchange"></article>`;

interface Entry {
  target: Element;
  intersectionRatio: number;
  isIntersecting: boolean;
}

let observed: Element[] = [];
let callback: ((entries: Entry[]) => void) | undefined;
let pauseCallback: ((entries: Entry[]) => void) | undefined;
let constructed = 0;
let pauseTargets: Element[] = [];

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class RecordingObserver {
  constructor(handler: (entries: Entry[]) => void) {
    constructed += 1;
    if (constructed === 1) pauseCallback = handler;
    else callback = handler;
  }
  observe(target: Element): void {
    if (constructed > 1) observed.push(target);
    else pauseTargets.push(target);
  }
  readonly unobserved: Element[] = [];
  disconnected = false;
  unobserve(target: Element): void {
    this.unobserved.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

function install(options: { reducedMotion: boolean; wide: boolean }): void {
  define("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? options.reducedMotion : options.wide,
  }));
  define("IntersectionObserver", RecordingObserver);
}

function overlay(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-streams]");
  if (!element) throw new Error("missing overlay");
  return element;
}

function entryFor(index: number, intersectionRatio: number): Entry {
  const target = observed[index];
  if (!target) throw new Error("missing exchange");
  return { target, intersectionRatio, isIntersecting: intersectionRatio > 0 };
}

describe("pickStage", () => {
  test("is 0 when nothing is visible", () => {
    expect(pickStage([0, 0, 0])).toBe(0);
    expect(pickStage([])).toBe(0);
  });

  test("returns the index of the largest ratio", () => {
    expect(pickStage([0.8, 0, 0])).toBe(0);
    expect(pickStage([0.1, 0.6, 0])).toBe(1);
    expect(pickStage([0, 0.2, 0.7])).toBe(2);
  });

  test("breaks ties toward the earlier exchange", () => {
    expect(pickStage([0, 0.5, 0.5])).toBe(1);
  });

  test("keeps the previous stage when nothing is visible", () => {
    expect(pickStage([0, 0, 0], 2)).toBe(2);
    expect(pickStage([0, 0.3, 0], 2)).toBe(1);
  });
});

describe("initPaintingStreams", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    observed = [];
    callback = undefined;
    pauseCallback = undefined;
    pauseTargets = [];
    constructed = 0;
    document.body.innerHTML = MARKUP;
  });

  test("sets the stage from the exchange in view", () => {
    install({ reducedMotion: false, wide: true });
    initPaintingStreams(document);
    expect(overlay().dataset.stage).toBe("0");
    expect(observed).toHaveLength(3);
    callback?.([entryFor(2, 0.9)]);
    expect(overlay().dataset.stage).toBe("2");
    callback?.([entryFor(2, 0), entryFor(1, 0.4)]);
    expect(overlay().dataset.stage).toBe("1");
  });

  test("keeps the last stage when the last exchange leaves the band", () => {
    install({ reducedMotion: false, wide: true });
    initPaintingStreams(document);
    callback?.([entryFor(2, 0.9)]);
    callback?.([entryFor(2, 0)]);
    expect(overlay().dataset.stage).toBe("2");
  });

  test("does nothing with reduced motion", () => {
    install({ reducedMotion: true, wide: true });
    initPaintingStreams(document);
    expect(observed).toHaveLength(0);
    expect(overlay().dataset.stage).toBeUndefined();
  });

  test("does nothing at 1000px and below", () => {
    install({ reducedMotion: false, wide: false });
    initPaintingStreams(document);
    expect(observed).toHaveLength(0);
    expect(overlay().dataset.stage).toBeUndefined();
  });

  test("leaves an overlay inside a pinned runway to the pin", () => {
    document.body.innerHTML = `<section data-pinned="true">${MARKUP}</section>`;
    install({ reducedMotion: false, wide: true });
    initPaintingStreams(document);
    expect(observed).toHaveLength(0);
    expect(overlay().dataset.stage).toBeUndefined();
  });

  test("pauses an overlay while it is off-screen and resumes it in view, pinned or not", () => {
    document.body.innerHTML = `<section data-pinned="true">${MARKUP}</section>`;
    install({ reducedMotion: false, wide: true });
    initPaintingStreams(document);
    expect(pauseTargets).toEqual([overlay()]);
    expect(overlay().dataset.paused).toBe("true");
    pauseCallback?.([{ target: overlay(), intersectionRatio: 1, isIntersecting: true }]);
    expect(overlay().dataset.paused).toBeUndefined();
    pauseCallback?.([{ target: overlay(), intersectionRatio: 0, isIntersecting: false }]);
    expect(overlay().dataset.paused).toBe("true");
  });

  test("pauses a visible overlay on a hidden tab", () => {
    install({ reducedMotion: false, wide: true });
    initPaintingStreams(document);
    pauseCallback?.([{ target: overlay(), intersectionRatio: 1, isIntersecting: true }]);
    expect(overlay().dataset.paused).toBeUndefined();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(overlay().dataset.paused).toBe("true");
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(overlay().dataset.paused).toBeUndefined();
  });
});
