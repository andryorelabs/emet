import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { initBentoScenes } from "./scene-player";

interface FakeScene {
  dataset: Record<string, string | undefined>;
  style: { values: Map<string, string>; setProperty: (name: string, value: string) => void };
}

type ObserverCallback = (entries: { target: unknown; isIntersecting: boolean }[]) => void;

const globals = globalThis as Record<string, unknown>;
let observers: { callback: ObserverCallback; observed: unknown[]; disconnected: boolean }[] = [];
let documentListeners: Map<string, () => void>;
let mediaListeners: (() => void)[];
let fakeDocument: { hidden: boolean };
let media: { matches: boolean };
const saved: Record<string, unknown> = {};

function makeScene(): FakeScene {
  const values = new Map<string, string>();
  return {
    dataset: {},
    style: {
      values,
      setProperty: (name, value) => {
        values.set(name, value);
      },
    },
  };
}

function makeRoot(scenes: FakeScene[]): ParentNode {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the player only calls querySelectorAll on the root
  return { querySelectorAll: () => scenes } as unknown as ParentNode;
}

function intersect(target: FakeScene, isIntersecting: boolean): void {
  for (const observer of observers) observer.callback([{ target, isIntersecting }]);
}

beforeEach(() => {
  observers = [];
  documentListeners = new Map();
  mediaListeners = [];
  media = { matches: false };
  fakeDocument = { hidden: false };
  for (const key of ["IntersectionObserver", "matchMedia", "document"]) saved[key] = globals[key];
  globals["IntersectionObserver"] = class {
    record: (typeof observers)[number];
    constructor(callback: ObserverCallback) {
      this.record = { callback, observed: [], disconnected: false };
      observers.push(this.record);
    }
    observe(target: unknown): void {
      this.record.observed.push(target);
    }
    disconnect(): void {
      this.record.disconnected = true;
    }
  };
  globals["matchMedia"] = () => ({
    get matches() {
      return media.matches;
    },
    addEventListener: (_type: string, listener: () => void) => mediaListeners.push(listener),
    removeEventListener: (_type: string, listener: () => void) => {
      mediaListeners = mediaListeners.filter((entry) => entry !== listener);
    },
  });
  globals["document"] = Object.assign(fakeDocument, {
    addEventListener: (type: string, listener: () => void) => documentListeners.set(type, listener),
    removeEventListener: (type: string) => documentListeners.delete(type),
  });
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) globals[key] = value;
});

describe("initBentoScenes", () => {
  it("plays a scene only while it is on screen", () => {
    const scene = makeScene();
    initBentoScenes(makeRoot([scene]));
    expect(scene.dataset["playing"]).toBeUndefined();
    intersect(scene, true);
    expect(scene.dataset["playing"]).toBe("");
    intersect(scene, false);
    expect(scene.dataset["playing"]).toBeUndefined();
  });

  it("phases each scene by its index", () => {
    const scenes = [makeScene(), makeScene(), makeScene()];
    initBentoScenes(makeRoot(scenes));
    expect(scenes.map((scene) => scene.style.values.get("--scene-offset"))).toEqual([
      "0.0s",
      "0.9s",
      "1.8s",
    ]);
  });

  it("pauses visible scenes while the document is hidden", () => {
    const scene = makeScene();
    initBentoScenes(makeRoot([scene]));
    intersect(scene, true);
    fakeDocument.hidden = true;
    documentListeners.get("visibilitychange")?.();
    expect(scene.dataset["playing"]).toBeUndefined();
    fakeDocument.hidden = false;
    documentListeners.get("visibilitychange")?.();
    expect(scene.dataset["playing"]).toBe("");
  });

  it("does nothing under reduced motion", () => {
    media.matches = true;
    const scene = makeScene();
    initBentoScenes(makeRoot([scene]));
    expect(observers).toHaveLength(0);
    expect(scene.dataset["playing"]).toBeUndefined();
  });

  it("follows preference changes", () => {
    const scene = makeScene();
    initBentoScenes(makeRoot([scene]));
    intersect(scene, true);
    media.matches = true;
    for (const listener of mediaListeners) listener();
    expect(scene.dataset["playing"]).toBeUndefined();
    expect(observers[0]?.disconnected).toBe(true);
    media.matches = false;
    for (const listener of mediaListeners) listener();
    expect(observers).toHaveLength(2);
  });

  it("stops and clears playing state", () => {
    const scene = makeScene();
    const stop = initBentoScenes(makeRoot([scene]));
    intersect(scene, true);
    stop();
    expect(scene.dataset["playing"]).toBeUndefined();
    expect(observers[0]?.disconnected).toBe(true);
    expect(mediaListeners).toHaveLength(0);
  });
});
