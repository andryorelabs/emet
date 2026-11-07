import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { initTypedTerminal } from "./typed-terminal";

const COMMAND = "claude plugin install emet";

const MARKUP = `
<article data-typed>
  <div class="emet-code" data-variant="command">
    <div class="emet-code__panel" data-code="${COMMAND}"><pre><code><div class="ec-line"><div class="code"><span>claude </span><span>plugin install emet</span></div></div></code></pre></div>
  </div>
  <div class="emet-code" data-variant="output">
    <div class="emet-code__panel" data-code="out"><pre><code><div class="ec-line"><div class="code"><span>one</span></div></div><div class="ec-line"><div class="code"><span>two</span></div></div></code></pre></div>
  </div>
  <div class="fragment"><pre class="terminal">alpha
beta
gamma</pre></div>
</article>`;

let clock = 0;
let queue: FrameRequestCallback[] = [];

function runFrames(untilMs: number, stepMs = 20): void {
  while (clock < untilMs) {
    clock += stepMs;
    const pending = queue;
    queue = [];
    for (const callback of pending) callback(clock);
  }
}

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
  define("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  define("IntersectionObserver", ImmediateObserver);
  performance.now = () => clock;
}

function commandPanel(): Element {
  const panel = document.querySelector(".emet-code__panel");
  if (!panel) throw new Error("missing command panel");
  return panel;
}

function visibleText(element: Element): string {
  const clone = element.cloneNode(true);
  if (!(clone instanceof Element)) throw new Error("not an element");
  for (const tail of clone.querySelectorAll(".tt-tail, .tt-cursor")) tail.remove();
  return clone.textContent;
}

describe("typed terminal DOM", () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  beforeEach(() => {
    clock = 0;
    queue = [];
    document.body.innerHTML = MARKUP;
  });

  test("types the command, reveals every output line and removes the cursor", () => {
    install(false);
    initTypedTerminal(document);
    expect(document.querySelectorAll(".tt-off").length).toBe(5);

    runFrames(60_000);

    const panel = commandPanel();
    expect(panel.querySelector("pre")?.textContent).toBe(COMMAND);
    expect(visibleText(panel)).toBe(COMMAND);
    expect(document.querySelectorAll(".tt-off").length).toBe(0);
    expect(document.querySelector(".tt-cursor")).toBeNull();
    expect(document.querySelector(".terminal")?.textContent).toBe("alpha\nbeta\ngamma");
  });

  test("keeps the full command copyable while typing", () => {
    install(false);
    initTypedTerminal(document);
    runFrames(200);

    const panel = commandPanel();
    const typed = visibleText(panel);
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan(COMMAND.length);
    expect(COMMAND.startsWith(typed)).toBe(true);
    expect(panel.getAttribute("data-code")).toBe(COMMAND);
    expect(panel.querySelector("pre")?.textContent).toBe(COMMAND);
    expect(document.querySelector(".tt-cursor")).not.toBeNull();
  });

  test("arms nothing with reduced motion", () => {
    install(true);
    initTypedTerminal(document);
    runFrames(60_000);

    expect(document.querySelectorAll(".tt-off, .tt-tail, .tt-cursor, .tt-line").length).toBe(0);
    expect(document.querySelector(".emet-code__panel pre")?.textContent).toBe(COMMAND);
    expect(queue.length).toBe(0);
  });
});
