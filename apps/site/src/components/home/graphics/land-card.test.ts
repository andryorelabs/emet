import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initLandCard } from "./land-card";

const MARKUP = `<div class="land" data-land></div>`;

let timers: { callback: () => void; ms: number }[] = [];

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

class ImmediateObserver {
  private readonly callback: (entries: unknown[]) => void;
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback([{ target, isIntersecting: true }]);
  }
  unobserve(): void {}
  disconnect(): void {}
}

function install(reducedMotion: boolean): void {
  define("matchMedia", () => ({ matches: reducedMotion }));
  define("IntersectionObserver", ImmediateObserver);
  define("setTimeout", (callback: () => void, ms: number) => timers.push({ callback, ms }));
}

function card(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-land]");
  if (!element) throw new Error("missing land card");
  return element;
}

describe("landing card", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    timers = [];
    document.body.innerHTML = MARKUP;
  });

  test("arms the card, ticks the tickets, then lands", () => {
    install(false);
    initLandCard(document);
    expect(card().dataset["land"]).toBe("armed");
    const [tick, land] = timers.toSorted((first, second) => first.ms - second.ms);
    tick?.callback();
    expect(card().dataset["land"]).toBe("ticking");
    land?.callback();
    expect(card().dataset["land"]).toBe("landed");
  });

  test("leaves the markup untouched with reduced motion", () => {
    install(true);
    initLandCard(document);
    expect(card().dataset["land"]).toBe("");
    expect(timers).toHaveLength(0);
  });
});
