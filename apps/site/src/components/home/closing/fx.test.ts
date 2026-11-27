import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PaintingFxOptions } from "../graphics/painting-fx";
import { initClosingFx } from "./fx";

let received: { host: HTMLElement; options: PaintingFxOptions } | undefined;
const calls: string[] = [];

function fakePaintingFx(host: HTMLElement, options: PaintingFxOptions) {
  received = { host, options };
  return {
    blink: () => calls.push("blink"),
    glow: () => calls.push("glow"),
    destroy: () => calls.push("destroy"),
  };
}

describe("closing fx", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(() => {
    void GlobalRegistrator.unregister();
  });

  test("runs clouds, water and eyes on the host", () => {
    const host = document.createElement("section");
    const command = document.createElement("div");
    initClosingFx(host, command, fakePaintingFx);
    expect(received?.host).toBe(host);
    expect(received?.options.effects).toEqual({ clouds: true, water: true, eyes: true });
    expect(received?.options.when).toBeUndefined();
  });

  test("the eyes look at the command, or at the pointer over the host, ignoring touch", () => {
    const host = document.createElement("section");
    const command = document.createElement("div");
    host.getBoundingClientRect = () => new DOMRect(0, 100, 1000, 400);
    command.getBoundingClientRect = () => new DOMRect(100, 300, 200, 40);
    const handle = initClosingFx(host, command, fakePaintingFx);
    expect(received?.options.gaze?.()).toEqual({ x: 200, y: 220 });
    globalThis.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 600, clientY: 200, pointerType: "mouse" }),
    );
    expect(received?.options.gaze?.()).toEqual({ x: 600, y: 100 });
    globalThis.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 10, pointerType: "touch" }),
    );
    expect(received?.options.gaze?.()).toEqual({ x: 600, y: 100 });
    handle.destroy();
    globalThis.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 700, clientY: 200, pointerType: "mouse" }),
    );
    expect(received?.options.gaze?.()).toEqual({ x: 600, y: 100 });
  });

  test("blink blinks and glows, and destroy releases the handle", () => {
    calls.length = 0;
    const handle = initClosingFx(
      document.createElement("section"),
      document.createElement("div"),
      fakePaintingFx,
    );
    handle.blink();
    handle.destroy();
    expect(calls).toEqual(["blink", "glow", "destroy"]);
  });

  test("frames the painting at 50% 70%", () => {
    const host = document.createElement("section");
    initClosingFx(host, document.createElement("div"), fakePaintingFx);
    expect(received?.options.painting?.objectPosition).toEqual([0.5, 0.7]);
  });
});
