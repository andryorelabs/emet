import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initOdometer, odometerDigits } from "./odometer";

const MARKUP = `
<section class="stats">
  <dl>
    <div class="stat" data-n="3"><dd class="stat-value"><span class="stat-text">3</span></dd></div>
    <div class="stat" data-n="10"><dd class="stat-value"><span class="stat-text">10</span></dd></div>
    <div class="stat" data-n="x"><dd class="stat-value"><span class="stat-text">x</span></dd></div>
    <div class="stat" data-n="4"></div>
    <div class="stat"><dd class="stat-value"><span class="stat-text">MIT</span></dd></div>
  </dl>
</section>`;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

let observers: FakeIntersectionObserver[] = [];

class FakeIntersectionObserver {
  readonly callback: (entries: { isIntersecting: boolean }[]) => void;
  disconnected = false;
  options: unknown;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void, options: unknown) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }
  observed = 0;
  observe(): void {
    this.observed++;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

function band(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".stats");
  if (!element) throw new Error("missing band");
  return element;
}

function stats(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".stat"));
}

describe("odometerDigits", () => {
  test("splits a whole number into digits", () => {
    expect(odometerDigits(3)).toEqual([3]);
    expect(odometerDigits(10)).toEqual([1, 0]);
    expect(odometerDigits(1)).toEqual([1]);
    expect(odometerDigits(0)).toEqual([0]);
    expect(odometerDigits(2048)).toEqual([2, 0, 4, 8]);
  });

  test("ignores the sign and the fraction", () => {
    expect(odometerDigits(-7)).toEqual([7]);
    expect(odometerDigits(12.9)).toEqual([1, 2]);
  });
});

describe("initOdometer", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    observers = [];
    document.body.innerHTML = MARKUP;
    define("matchMedia", () => ({ matches: false }));
    define("IntersectionObserver", FakeIntersectionObserver);
  });

  test("leaves the plain values untouched with reduced motion", () => {
    define("matchMedia", () => ({ matches: true }));
    initOdometer(band());
    expect(document.querySelector(".odo")).toBeNull();
    expect(band().dataset.armed).toBeUndefined();
    expect(observers).toHaveLength(0);
  });

  test("builds hidden digit columns for numeric items only and keeps the text readable", () => {
    initOdometer(band());
    const [three, ten, bad, missing, mit] = stats();
    expect(three?.querySelectorAll(".odo-digit")).toHaveLength(1);
    expect(ten?.querySelectorAll(".odo-digit")).toHaveLength(2);
    expect(bad?.querySelector(".odo")).toBeNull();
    expect(missing?.querySelector(".odo")).toBeNull();
    expect(mit?.querySelector(".odo")).toBeNull();
    const odometer = ten?.querySelector(".odo");
    expect(odometer?.getAttribute("aria-hidden")).toBe("true");
    expect(ten?.querySelector(".stat-text")?.classList.contains("sr-only")).toBe(true);
    expect(ten?.querySelector(".stat-text")?.textContent).toBe("10");
    const columns = Array.from(ten?.querySelectorAll<HTMLElement>(".odo-digit") ?? []);
    expect(columns.map((column) => column.style.getPropertyValue("--digit"))).toEqual(["1", "0"]);
    expect(columns[0]?.style.getPropertyValue("--order")).toBe("1");
    expect(ten?.style.getPropertyValue("--order")).toBe("1");
    expect(columns[0]?.querySelectorAll(".odo-roll > span")).toHaveLength(10);
    expect(columns[0]?.querySelector(".odo-roll")?.textContent).toBe("0123456789");
    expect(ten?.dataset.odo).toBe("");
    expect(band().dataset.armed).toBe("");
  });

  test("rolls every item once the band is in view, then disconnects", () => {
    initOdometer(band());
    const [observer] = observers;
    expect(observer?.options).toEqual({ threshold: 0.3 });
    expect(stats().every((stat) => stat.dataset.rolled === undefined)).toBe(true);
    observer?.callback([{ isIntersecting: false }]);
    expect(stats().every((stat) => stat.dataset.rolled === undefined)).toBe(true);
    observer?.callback([{ isIntersecting: true }]);
    expect(stats().every((stat) => stat.dataset.rolled === "")).toBe(true);
    expect(observer?.disconnected).toBe(true);
  });

  test("rolls straight away when IntersectionObserver is missing", () => {
    define("IntersectionObserver", undefined);
    initOdometer(band());
    expect(stats().every((stat) => stat.dataset.rolled === "")).toBe(true);
  });

  test("skips an item that has no value element", () => {
    initOdometer(band());
    expect(stats()[3]?.dataset.odo).toBeUndefined();
  });
});
