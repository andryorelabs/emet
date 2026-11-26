import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PaintingFxOptions } from "../graphics/painting-fx";
import { initAboutFx } from "./fx";

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

function pick(selector: string, scope: ParentNode = document): HTMLElement {
  const found = scope.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

describe("about fx", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(() => {
    void GlobalRegistrator.unregister();
  });

  test("runs the portrait effects with eyeScale 4.4 gated on the reveal", () => {
    document.body.innerHTML = `<div class="portrait-frame"><img alt="" /></div>`;
    const portrait = pick(".portrait-frame");
    let done = false;
    initAboutFx(portrait, () => done, fakePaintingFx);
    expect(received?.host).toBe(portrait);
    expect(received?.options.eyeScale).toBe(4.4);
    expect(received?.options.effects).toEqual({ clouds: true, eyes: true });
    expect(received?.options.when?.()).toBe(false);
    done = true;
    expect(received?.options.when?.()).toBe(true);
  });

  test("eyes follow the pointer in portrait coordinates and stop after destroy", () => {
    document.body.innerHTML = `<div class="portrait-frame"><img alt="" /></div>`;
    const portrait = pick(".portrait-frame");
    portrait.getBoundingClientRect = () => new DOMRect(50, 100, 400, 500);
    const handle = initAboutFx(portrait, () => true, fakePaintingFx);
    expect(received?.options.gaze?.()).toBeNull();
    globalThis.dispatchEvent(new PointerEvent("pointermove", { clientX: 250, clientY: 300 }));
    expect(received?.options.gaze?.()).toEqual({ x: 200, y: 200 });
    handle.destroy();
    expect(destroyed).toBe(true);
    globalThis.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    expect(received?.options.gaze?.()).toEqual({ x: 200, y: 200 });
  });
});
