import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initBentoInteractions, registerScene } from "../bento/interact/registry";

beforeAll(() => {
  GlobalRegistrator.register();
  registerScene("flags", () => undefined);
  registerScene("approval", () => undefined);
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

/**
 * Records the details of every event of a name until stopped.
 */
function record(name: string): { details: unknown[]; stop(): void } {
  const details: unknown[] = [];
  const listener = (event: Event): void => {
    details.push(event instanceof CustomEvent ? event.detail : undefined);
  };
  globalThis.addEventListener(name, listener);
  return {
    details,
    stop: () => {
      globalThis.removeEventListener(name, listener);
    },
  };
}

describe("bento scenes announce visitor actions", () => {
  test("a flag toggle reports whether the wave is held", () => {
    document.body.innerHTML = `<div data-interact="flags"><button class="flags-toggle"></button></div>`;
    const scene = document.querySelector<HTMLElement>("[data-interact]");
    const toggle = document.querySelector<HTMLElement>(".flags-toggle");
    if (!scene || !toggle) throw new Error("fixture");
    const heard = record("emet:flag-toggle");
    initBentoInteractions(document);
    toggle.click();
    scene.dataset.held = "";
    toggle.click();
    heard.stop();
    expect(heard.details).toEqual([{ held: false }, { held: true }]);
  });

  test("a scene without its toggle announces nothing", () => {
    document.body.innerHTML = `<div data-interact="flags"></div>`;
    initBentoInteractions(document);
    expect(document.querySelector("[data-interact]")).not.toBeNull();
  });

  test("a finished approval hold is announced once data-done appears", async () => {
    document.body.innerHTML = `<div data-interact="approval"></div>`;
    const scene = document.querySelector<HTMLElement>("[data-interact]");
    if (!scene) throw new Error("fixture");
    const heard = record("emet:approval-hold");
    initBentoInteractions(document);
    scene.dataset.manual = "";
    scene.dataset.done = "";
    await Bun.sleep(5);
    delete scene.dataset.done;
    await Bun.sleep(5);
    heard.stop();
    expect(heard.details).toHaveLength(1);
  });
});
