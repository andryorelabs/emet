import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PaintingFxOptions } from "../graphics/painting-fx";
import { initHowFx, isRunwayRevealed } from "./fx";

let received: { host: HTMLElement; options: PaintingFxOptions } | undefined;
let destroyed = false;

function fakePaintingFx(host: HTMLElement, options: PaintingFxOptions) {
  received = { host, options };
  return {
    blink: () => undefined,
    glow: () => undefined,
    destroy() {
      destroyed = true;
    },
  };
}

describe("how fx", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(() => {
    void GlobalRegistrator.unregister();
  });

  test("runs clouds and eyes only, gated on the dither, and destroys the handle", () => {
    const stage = document.createElement("figure");
    let done = false;
    const handle = initHowFx(stage, () => done, fakePaintingFx);
    expect(received?.host).toBe(stage);
    expect(received?.options.effects).toEqual({ clouds: true, eyes: true });
    expect(received?.options.when?.()).toBe(false);
    done = true;
    expect(received?.options.when?.()).toBe(true);
    handle.destroy();
    expect(destroyed).toBe(true);
  });

  test("an unpinned runway is revealed and a pinned one is revealed at the end of the dither", () => {
    const runway = document.createElement("section");
    expect(isRunwayRevealed(runway)).toBe(true);
    runway.dataset.pinned = "true";
    innerHeight = 900;
    runway.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 2700);
    expect(isRunwayRevealed(runway)).toBe(false);
    runway.getBoundingClientRect = () => new DOMRect(0, -1800, 1000, 2700);
    expect(isRunwayRevealed(runway)).toBe(true);
  });
});
