import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const MARKUP = `
<section class="about">
  <figure class="portrait">
    <img src="portrait.webp" alt="" />
    <canvas data-pixel-reveal></canvas>
  </figure>
</section>`;

let frames: FrameRequestCallback[] = [];
let top = 800;
let reduced = false;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function flushFrames(): void {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

function section(): HTMLElement {
  const root = document.querySelector<HTMLElement>("section.about");
  if (!root) throw new Error("missing section");
  root.getBoundingClientRect = () => new DOMRect(0, top, 0, 600);
  return root;
}

describe("mountAbout", () => {
  let mountAbout: (root: HTMLElement, reduce: boolean) => () => void;

  beforeAll(async () => {
    GlobalRegistrator.register();
    define("matchMedia", () => ({ matches: reduced }));
    define("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    define("cancelAnimationFrame", () => undefined);
    define(
      "IntersectionObserver",
      class {
        observe(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );
    Object.defineProperty(globalThis, "innerHeight", { value: 1000, configurable: true });
    ({ mountAbout } = await import("./about"));
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  test("writes the strike progress at mount and on scroll", () => {
    document.body.innerHTML = MARKUP;
    const root = section();
    top = 900;
    const stop = mountAbout(root, false);
    expect(root.style.getPropertyValue("--strike")).toBe("0.0000");
    top = 0;
    globalThis.dispatchEvent(new Event("scroll"));
    globalThis.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(root.style.getPropertyValue("--strike")).toBe("1.0000");
    stop();
    top = 900;
    globalThis.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
  });

  test("under reduced motion it never scrubs and stops cleanly", () => {
    document.body.innerHTML = MARKUP;
    const root = section();
    root.style.removeProperty("--strike");
    const stop = mountAbout(root, true);
    globalThis.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
    expect(root.style.getPropertyValue("--strike")).toBe("");
    expect(() => {
      stop();
    }).not.toThrow();
  });

  test("a section without the portrait still scrubs the strike", () => {
    const bare = document.createElement("section");
    bare.getBoundingClientRect = () => new DOMRect(0, 0, 0, 600);
    const stop = mountAbout(bare, false);
    expect(bare.style.getPropertyValue("--strike")).toBe("1.0000");
    stop();
  });

  test("the self-mounting entry reads the reduced-motion query", async () => {
    reduced = true;
    document.body.innerHTML = MARKUP;
    const root = section();
    const entry = "./about?entry";
    await import(entry);
    expect(root.style.getPropertyValue("--strike")).toBe("");
  });
});
