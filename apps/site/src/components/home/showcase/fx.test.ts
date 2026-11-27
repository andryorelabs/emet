import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PaintingFxOptions } from "../graphics/painting-fx";
import {
  initShowcaseFx,
  gazeFor,
  mirrorMarkers,
  NARROW_OBJECT_POSITION,
  showcaseObjectPosition,
  WIDE_OBJECT_POSITION,
} from "./fx";

const showcaseCss = readFileSync(new URL("../../../styles/showcase.css", import.meta.url), "utf8");

function cssPosition(value: string): [number, number] {
  const [x, y] = value.split(" ").map((part) => Number.parseFloat(part) / 100);
  if (x === undefined || y === undefined) throw new Error(`bad position ${value}`);
  return [x, y];
}

function mediaBlock(query: string): string {
  const start = showcaseCss.indexOf(`@media (${query})`);
  if (start < 0) throw new Error(`missing media ${query}`);
  return showcaseCss.slice(start, start + 1400);
}

function stubMedia(wide: boolean): { fire(next: boolean): void; removed: () => number } {
  const listeners = new Set<() => void>();
  let matches = wide;
  let removedCount = 0;
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => {
        removedCount += 1;
        listeners.delete(cb);
      },
    }),
  });
  return {
    fire(next) {
      matches = next;
      for (const cb of listeners) cb();
    },
    removed: () => removedCount,
  };
}

const MARKUP = `
<section data-showcase data-state="merged">
  <div class="showcase-frame">
    <div class="showcase-stage">
      <picture><img class="showcase-day" src="day.webp" alt="" /></picture>
      <picture data-fx-dusk><img class="showcase-dusk" alt="" /></picture>
    </div>
    <button class="showcase-switch"></button>
  </div>
</section>`;

interface FakeHandle {
  host: HTMLElement;
  options: PaintingFxOptions;
  blinks: number;
  glows: number;
  destroyed: boolean;
}

const created: FakeHandle[] = [];

function fakePaintingFx(host: HTMLElement, options: PaintingFxOptions) {
  const record: FakeHandle = { host, options, blinks: 0, glows: 0, destroyed: false };
  created.push(record);
  return {
    blink() {
      record.blinks += 1;
    },
    glow() {
      record.glows += 1;
    },
    destroy() {
      record.destroyed = true;
    },
  };
}

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function pick(selector: string, scope: ParentNode = document): HTMLElement {
  const found = scope.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

function first<T>(items: readonly T[], index = 0): T {
  const item = items[index];
  if (item === undefined) throw new Error("missing item");
  return item;
}

function frame(): HTMLElement {
  return pick(".showcase-frame");
}

function switchEl(): HTMLElement {
  return pick(".showcase-switch");
}

function root(): HTMLElement {
  return pick("[data-showcase]");
}

function dusk(): HTMLImageElement {
  const found = document.querySelector<HTMLImageElement>(".showcase-dusk");
  if (!found) throw new Error("missing .showcase-dusk");
  return found;
}

function setLoaded(image: HTMLImageElement, loaded: boolean): void {
  Object.defineProperty(image, "complete", { value: loaded, configurable: true });
  Object.defineProperty(image, "naturalWidth", { value: loaded ? 1672 : 0, configurable: true });
}

describe("showcase fx", () => {
  let flagCallback: ((held: boolean) => void) | undefined;

  const subscribe = (cb: (held: boolean) => void): void => {
    flagCallback = cb;
  };

  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(() => {
    void GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    created.length = 0;
    flagCallback = undefined;
  });

  test("starts the day painting only and gates it on the merged state", () => {
    setLoaded(dusk(), false);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    expect(created).toHaveLength(1);
    const [day] = created;
    expect(day?.host.querySelector(".showcase-day")).not.toBeNull();
    expect(day?.options.effects).toEqual({ clouds: true, water: true, eyes: true });
    expect(day?.options.when?.()).toBe(true);
  });

  test("blinks and glows the active painting when the flag changes", () => {
    setLoaded(dusk(), true);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    expect(created).toHaveLength(2);
    const [day, held] = created;
    expect(day?.options.when?.()).toBe(false);
    expect(held?.options.when?.()).toBe(true);
    expect(held?.blinks).toBe(1);
    expect(held?.glows).toBe(1);
    expect(day?.blinks).toBe(0);
    flagCallback?.(false);
    expect(day?.blinks).toBe(1);
    expect(day?.glows).toBe(1);
    flagCallback?.(true);
    expect(created).toHaveLength(2);
    expect(held?.blinks).toBe(2);
  });

  test("waits for the dusk image to load before building its effect", () => {
    setLoaded(dusk(), false);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    flagCallback?.(true);
    expect(created).toHaveLength(1);
    dusk().dispatchEvent(new Event("load"));
    expect(created).toHaveLength(2);
  });

  test("builds the dusk effect at once when the page starts held", () => {
    root().dataset.state = "held";
    setLoaded(dusk(), true);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    expect(created).toHaveLength(2);
    expect(created[0]?.options.when?.()).toBe(false);
  });

  test("skips the dusk effect when the host is missing and a destroyed page ignores late loads", () => {
    document.querySelector("[data-fx-dusk]")?.remove();
    const handle = initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    expect(created).toHaveLength(1);
    handle.destroy();

    document.body.innerHTML = MARKUP;
    setLoaded(dusk(), false);
    const late = initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    late.destroy();
    dusk().dispatchEvent(new Event("load"));
    expect(created.filter((entry) => entry.host.hasAttribute("data-fx-dusk"))).toHaveLength(0);
  });

  test("starts nothing without a day image", () => {
    document.querySelector(".showcase-day")?.remove();
    setLoaded(dusk(), true);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    expect(created).toHaveLength(0);
  });

  test("works without a showcase root", () => {
    document.body.innerHTML = `<div class="showcase-frame"><picture><img class="showcase-day" /></picture><i class="showcase-switch"></i></div>`;
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    expect(created).toHaveLength(1);
    flagCallback?.(true);
    expect(created).toHaveLength(1);
  });

  test("destroys both effects and stops tracking the pointer", () => {
    setLoaded(dusk(), true);
    const handle = initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    handle.destroy();
    expect(created.every((entry) => entry.destroyed)).toBe(true);
  });

  test("gaze looks at the switch until the pointer is over the frame", () => {
    setLoaded(dusk(), true);
    frame().getBoundingClientRect = () => rectOf(0, 0, 1000, 600);
    switchEl().getBoundingClientRect = () => rectOf(100, 100, 20, 20);
    const day = (): HTMLElement => first(created).host;
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    day().getBoundingClientRect = () => rectOf(10, 20, 1000, 600);
    expect(created[0]?.options.gaze?.()).toEqual({ x: 100, y: 90 });
    globalThis.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 300 }));
    expect(created[0]?.options.gaze?.()).toEqual({ x: 390, y: 280 });
    globalThis.dispatchEvent(new PointerEvent("pointermove", { clientX: 4000, clientY: 300 }));
    expect(created[0]?.options.gaze?.()).toEqual({ x: 100, y: 90 });
  });

  test("gazeFor ignores a missing pointer", () => {
    frame().getBoundingClientRect = () => rectOf(0, 0, 100, 100);
    switchEl().getBoundingClientRect = () => rectOf(0, 0, 10, 10);
    expect(gazeFor(frame(), frame(), switchEl(), null)).toEqual({ x: 5, y: 5 });
  });

  test("mirrors the markers of any host onto the stage", () => {
    const stage = pick(".showcase-stage");
    const day = pick("picture", frame());
    const held = pick("[data-fx-dusk]");
    day.dataset.fx = "on";
    day.setAttribute("data-fx-eyes", "");
    mirrorMarkers(stage, [day, held]);
    expect(stage.dataset.fx).toBe("on");
    expect(stage.hasAttribute("data-fx-eyes")).toBe(true);
    expect(stage.hasAttribute("data-fx-water")).toBe(false);
    day.removeAttribute("data-fx");
    day.removeAttribute("data-fx-eyes");
    mirrorMarkers(stage, [day, held]);
    expect(stage.hasAttribute("data-fx")).toBe(false);
  });

  test("keeps the stage markers in step with the hosts", async () => {
    setLoaded(dusk(), true);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    first(created).host.dataset.fx = "on";
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector(".showcase-stage")?.getAttribute("data-fx")).toBe("on");
  });

  test("frames the fx like the CSS image: 50% 50% from 901px, the narrow position below", () => {
    const wideBlock = mediaBlock("min-width: 901px");
    const narrowBlock = mediaBlock("max-width: 900px");
    const baseImage =
      /\.showcase-stage img \{\s*object-fit: cover;\s*object-position: ([^;]+);/.exec(
        showcaseCss,
      )?.[1];
    const narrowImage = /\.showcase-stage img \{\s*object-position: ([^;]+);/.exec(
      narrowBlock,
    )?.[1];
    expect(cssPosition(baseImage ?? "")).toEqual([...WIDE_OBJECT_POSITION]);
    expect(cssPosition(narrowImage ?? "")).toEqual([...NARROW_OBJECT_POSITION]);
    expect(/--ox: ([\d.]+)/.exec(wideBlock)?.[1] ?? "0.5").toBe(String(WIDE_OBJECT_POSITION[0]));
    expect(/--oy: ([\d.]+)/.exec(wideBlock)?.[1]).toBe(String(WIDE_OBJECT_POSITION[1]));
  });

  test("hands the width-matched object position to each painting and reframes on change", () => {
    setLoaded(dusk(), true);
    const media = stubMedia(true);
    const handle = initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    flagCallback?.(true);
    expect(created.map((entry) => entry.options.objectPosition)).toEqual([
      WIDE_OBJECT_POSITION,
      WIDE_OBJECT_POSITION,
    ]);
    media.fire(false);
    expect(created).toHaveLength(4);
    expect(created.slice(0, 2).every((entry) => entry.destroyed)).toBe(true);
    expect(created.slice(2).map((entry) => entry.options.objectPosition)).toEqual([
      NARROW_OBJECT_POSITION,
      NARROW_OBJECT_POSITION,
    ]);
    handle.destroy();
    expect(media.removed()).toBe(1);
    media.fire(true);
    expect(created).toHaveLength(4);
  });

  test("reframes only the day painting while the dusk one was never built", () => {
    setLoaded(dusk(), true);
    const media = stubMedia(false);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    media.fire(true);
    expect(created).toHaveLength(2);
    expect(created[1]?.options.objectPosition).toEqual(WIDE_OBJECT_POSITION);
    expect(showcaseObjectPosition()).toEqual(WIDE_OBJECT_POSITION);
  });

  test("falls back to the narrow position without matchMedia", () => {
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(showcaseObjectPosition()).toEqual(NARROW_OBJECT_POSITION);
    initShowcaseFx(frame(), switchEl(), subscribe, fakePaintingFx);
    expect(created[0]?.options.objectPosition).toEqual(NARROW_OBJECT_POSITION);
  });
});
