import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { readFileSync } from "node:fs";

import { asElement, FakeElement } from "./fake-dom";
import { initFlagToggle } from "./flag-toggle";
import { createHoldController, initApproval } from "./hold-approve";
import { initBentoInteractions, registerScene } from "./registry";
import { initReviewGate } from "./review-gate";
import { initSpotlight } from "./spotlight";

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  jest.useFakeTimers();
  for (const key of ["document", "matchMedia", "Element"]) saved[key] = globals[key];
  globals.document = new EventTarget();
  globals.Element = FakeElement;
});

afterEach(() => {
  jest.useRealTimers();
  for (const key of ["document", "matchMedia", "Element"]) globals[key] = saved[key];
});

function makeHold(): { calls: string[]; controller: ReturnType<typeof createHoldController> } {
  const calls: string[] = [];
  const controller = createHoldController({
    holdMs: 900,
    onComplete: () => calls.push("complete"),
    onCancel: () => calls.push("cancel"),
  });
  return { calls, controller };
}

describe("createHoldController", () => {
  it("completes only after the full hold", () => {
    const { calls, controller } = makeHold();
    controller.start();
    expect(controller.holding).toBe(true);
    jest.advanceTimersByTime(899);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(calls).toEqual(["complete"]);
    expect(controller.holding).toBe(false);
  });

  it("cancels an early release and never completes", () => {
    const { calls, controller } = makeHold();
    controller.start();
    jest.advanceTimersByTime(400);
    controller.cancel();
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual(["cancel"]);
    expect(controller.holding).toBe(false);
  });

  it("ignores a second start and a cancel while idle", () => {
    const { calls, controller } = makeHold();
    controller.cancel();
    controller.start();
    controller.start();
    jest.advanceTimersByTime(900);
    expect(calls).toEqual(["complete"]);
  });

  it("drops the pending hold on dispose without a callback", () => {
    const { calls, controller } = makeHold();
    controller.start();
    controller.dispose();
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });
});

function makeApproval(): {
  scene: FakeElement;
  button: FakeElement;
  stamp: FakeElement;
  status: FakeElement;
} {
  const scene = new FakeElement();
  const button = new FakeElement();
  const stamp = new FakeElement();
  const status = new FakeElement();
  scene.dataset.doneText = "Approved";
  scene.children.set(".approval-button", button);
  scene.children.set(".approval-stamp", stamp);
  scene.children.set(".approval-status", status);
  initApproval(asElement(scene));
  return { scene, button, stamp, status };
}

describe("initApproval", () => {
  it("does nothing when a part is missing", () => {
    const scene = new FakeElement();
    initApproval(asElement(scene));
    expect(scene.dataset.manual).toBeUndefined();
  });

  it("enables the button and takes over the loop on hover", () => {
    const { scene, button } = makeApproval();
    expect(button.inert).toBe(false);
    button.fire("pointerenter");
    expect(scene.dataset.manual).toBe("");
  });

  it("approves after a 0.9 s pointer hold and announces it", () => {
    const { scene, button, stamp, status } = makeApproval();
    button.fire("pointerenter");
    button.fire("pointerdown", { button: 0 });
    expect(button.dataset.holding).toBe("");
    jest.advanceTimersByTime(900);
    expect(button.dataset.holding).toBeUndefined();
    expect(scene.dataset.done).toBe("");
    expect(stamp.dataset.pop).toBe("");
    expect(status.textContent).toBe("Approved");
    button.fire("pointerleave");
    jest.advanceTimersByTime(1800);
    expect(scene.dataset.manual).toBeUndefined();
    expect(scene.dataset.done).toBeUndefined();
    expect(status.textContent).toBe("");
  });

  it("ignores a non-primary pointer button", () => {
    const { scene, button } = makeApproval();
    button.fire("pointerdown", { button: 2 });
    jest.advanceTimersByTime(900);
    expect(scene.dataset.done).toBeUndefined();
  });

  it("drops an early release and settles back after 0.3 s", () => {
    const { scene, button } = makeApproval();
    button.fire("pointerdown", { button: 0 });
    jest.advanceTimersByTime(500);
    button.fire("pointerup");
    jest.advanceTimersByTime(500);
    expect(scene.dataset.done).toBeUndefined();
    expect(button.dataset.holding).toBeUndefined();
    expect(scene.dataset.manual).toBe("");
    button.fire("pointerleave");
    jest.advanceTimersByTime(300);
    expect(scene.dataset.manual).toBeUndefined();
  });

  it("keeps the manual state while the pointer is still over the button", () => {
    const { scene, button } = makeApproval();
    button.fire("pointerenter");
    button.fire("pointerdown", { button: 0 });
    jest.advanceTimersByTime(900);
    jest.advanceTimersByTime(5000);
    expect(scene.dataset.done).toBe("");
    button.fire("pointercancel");
    button.fire("pointerleave");
    jest.advanceTimersByTime(1800);
    expect(scene.dataset.done).toBeUndefined();
  });

  it("holds with Space and Enter, and releases on keyup", () => {
    const { scene, button } = makeApproval();
    button.fire("focus");
    const down = button.fire("keydown", { key: " ", repeat: false });
    expect(down.defaultPrevented).toBe(true);
    button.fire("keydown", { key: " ", repeat: true });
    jest.advanceTimersByTime(900);
    expect(scene.dataset.done).toBe("");
    button.fire("keyup", { key: " " });
    button.fire("keydown", { key: "Enter", repeat: false });
    button.fire("keyup", { key: "Enter" });
    button.fire("keydown", { key: "a" });
    button.fire("keyup", { key: "a" });
    button.fire("blur");
    jest.advanceTimersByTime(1800);
    expect(scene.dataset.manual).toBeUndefined();
  });

  it("prevents the context menu and the click", () => {
    const { button } = makeApproval();
    expect(button.fire("contextmenu").defaultPrevented).toBe(true);
    expect(button.fire("click").defaultPrevented).toBe(true);
  });

  it("does not settle while a new hold has started", () => {
    const { scene, button } = makeApproval();
    button.fire("pointerdown", { button: 0 });
    button.fire("pointerup");
    button.fire("pointerdown", { button: 0 });
    jest.advanceTimersByTime(400);
    expect(scene.dataset.manual).toBe("");
  });

  it("restarts from a clean state when a second hold begins", () => {
    const { scene, button, stamp } = makeApproval();
    button.fire("focus");
    button.fire("pointerdown", { button: 0 });
    jest.advanceTimersByTime(900);
    button.fire("pointerdown", { button: 0 });
    expect(scene.dataset.done).toBeUndefined();
    expect(stamp.dataset.pop).toBeUndefined();
  });

  it("falls back to empty status text without a label", () => {
    const { scene, button, status } = makeApproval();
    delete scene.dataset.doneText;
    const bare = new FakeElement();
    bare.children = scene.children;
    initApproval(asElement(bare));
    button.fire("pointerdown", { button: 0 });
    jest.advanceTimersByTime(900);
    expect(status.textContent).toBe("");
  });
});

function keydown(key: string): Event {
  return Object.defineProperty(new Event("keydown"), "key", { value: key });
}

function makeGate(): { gate: FakeElement } {
  const scene = new FakeElement();
  const gate = new FakeElement();
  scene.children.set(".review-gate", gate);
  initReviewGate(asElement(scene));
  return { gate };
}

describe("initReviewGate", () => {
  it("does nothing without a gate", () => {
    initReviewGate(asElement(new FakeElement()));
  });

  it("opens on hover and focus and closes when both leave", () => {
    const { gate } = makeGate();
    expect(gate.inert).toBe(false);
    gate.fire("pointerenter");
    expect(gate.dataset.open).toBe("");
    gate.fire("focus");
    gate.fire("pointerleave");
    expect(gate.dataset.open).toBe("");
    gate.fire("blur");
    expect(gate.dataset.open).toBeUndefined();
  });

  it("pins on press and unpins on a second press", () => {
    const { gate } = makeGate();
    gate.fire("click");
    expect(gate.dataset.open).toBe("");
    gate.fire("click");
    expect(gate.dataset.open).toBeUndefined();
  });

  it("dismisses on Escape from the document and ignores other keys", () => {
    const { gate } = makeGate();
    const target = globals.document;
    if (!(target instanceof EventTarget)) throw new Error("document stand-in missing");
    gate.fire("pointerenter");
    target.dispatchEvent(keydown("a"));
    expect(gate.dataset.open).toBe("");
    target.dispatchEvent(keydown("Escape"));
    expect(gate.dataset.open).toBeUndefined();
    target.dispatchEvent(keydown("Escape"));
    expect(gate.dataset.open).toBeUndefined();
  });
});

function makeFlags(heldText?: string): {
  scene: FakeElement;
  toggle: FakeElement;
  caption: FakeElement;
} {
  const scene = new FakeElement();
  const toggle = new FakeElement();
  const caption = new FakeElement();
  if (heldText !== undefined) scene.dataset.heldText = heldText;
  scene.children.set(".flags-toggle", toggle);
  scene.children.set(".flags-caption", caption);
  initFlagToggle(asElement(scene));
  return { scene, toggle, caption };
}

describe("initFlagToggle", () => {
  it("does nothing when a part is missing", () => {
    initFlagToggle(asElement(new FakeElement()));
  });

  it("holds the wave and shows the caption, then releases", () => {
    const { scene, toggle, caption } = makeFlags("Spec 41 held");
    expect(toggle.inert).toBe(false);
    toggle.fire("click");
    expect(toggle.attributes.get("aria-pressed")).toBe("true");
    expect(scene.dataset.held).toBe("");
    expect(caption.textContent).toBe("Spec 41 held");
    toggle.fire("click");
    expect(toggle.attributes.get("aria-pressed")).toBe("false");
    expect(scene.dataset.held).toBeUndefined();
    expect(caption.textContent).toBe("");
  });

  it("shows an empty caption without a held text", () => {
    const { toggle, caption } = makeFlags();
    toggle.fire("click");
    expect(caption.textContent).toBe("");
  });
});

function setupSpotlight(matches: boolean): {
  root: FakeElement;
  card: FakeElement;
  other: FakeElement;
} {
  globals.matchMedia = () => ({ matches });
  const root = new FakeElement();
  const card = new FakeElement();
  const other = new FakeElement();
  card.matches.add(".bento-card");
  other.matches.add(".bento-card");
  initSpotlight(asElement(root));
  return { root, card, other };
}

describe("initSpotlight", () => {
  it("does nothing without a fine hover pointer or with reduced motion", () => {
    const { root, card } = setupSpotlight(false);
    root.fire("pointermove", { target: card, clientX: 30, clientY: 50 });
    expect(card.dataset.spot).toBeUndefined();
  });

  it("tracks the pointer inside the card it is over", () => {
    const { root, card, other } = setupSpotlight(true);
    root.fire("pointermove", { target: card, clientX: 30.4, clientY: 50 });
    expect(card.dataset.spot).toBe("");
    expect(card.styleValues.get("--spot-x")).toBe("20px");
    expect(card.styleValues.get("--spot-y")).toBe("30px");
    root.fire("pointermove", { target: other, clientX: 11, clientY: 21 });
    expect(card.dataset.spot).toBeUndefined();
    expect(other.dataset.spot).toBe("");
    root.fire("pointermove", { target: other, clientX: 12, clientY: 22 });
    expect(other.dataset.spot).toBe("");
  });

  it("finds the card from a nested target", () => {
    const { root, card } = setupSpotlight(true);
    const inner = new FakeElement();
    inner.parent = card;
    root.fire("pointermove", { target: inner, clientX: 15, clientY: 25 });
    expect(card.dataset.spot).toBe("");
  });

  it("clears outside a card, on a non-element target and on leave", () => {
    const { root, card } = setupSpotlight(true);
    root.fire("pointermove", { target: card, clientX: 30, clientY: 50 });
    root.fire("pointermove", { target: new FakeElement(), clientX: 0, clientY: 0 });
    expect(card.dataset.spot).toBeUndefined();
    root.fire("pointermove", { target: card, clientX: 30, clientY: 50 });
    root.fire("pointermove", { target: new EventTarget(), clientX: 0, clientY: 0 });
    expect(card.dataset.spot).toBeUndefined();
    root.fire("pointermove", { target: card, clientX: 30, clientY: 50 });
    root.fire("pointerleave");
    expect(card.dataset.spot).toBeUndefined();
    root.fire("pointerleave");
  });
});

describe("initBentoInteractions", () => {
  it("wires each registered element once and skips unknown names", () => {
    const calls: string[] = [];
    registerScene("probe", (element) => calls.push(element.dataset.interact ?? ""));
    const known = new FakeElement();
    known.dataset.interact = "probe";
    const unknown = new FakeElement();
    unknown.dataset.interact = "nothing";
    const unnamed = new FakeElement();
    const rootAll = {
      querySelectorAll: () => [known, unknown, unnamed, known].map((element) => asElement(element)),
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the registry only calls querySelectorAll on the root
    initBentoInteractions(rootAll as unknown as ParentNode);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the registry only calls querySelectorAll on the root
    initBentoInteractions(rootAll as unknown as ParentNode);
    expect(calls).toEqual(["probe"]);
  });
});

describe("interact entry", () => {
  it("registers the four scenes", async () => {
    const { initBentoInteractions: wire } = await import("./index");
    const scene = new FakeElement();
    const toggle = new FakeElement();
    scene.dataset.interact = "flags";
    scene.children.set(".flags-toggle", toggle);
    scene.children.set(".flags-caption", new FakeElement());
    const root = { querySelectorAll: () => [asElement(scene)] };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the registry only calls querySelectorAll on the root
    wire(root as unknown as ParentNode);
    expect(toggle.inert).toBe(false);
  });
});

describe("interactive scene markup", () => {
  const scenesDirectory = new URL("../scenes/", import.meta.url);
  const read = (name: string): string => readFileSync(new URL(name, scenesDirectory), "utf8");

  it.each([
    ["ApprovalScene.astro", "approval"],
    ["ReviewScene.astro", "review"],
    ["FlagsScene.astro", "flags"],
  ])(
    "%s is wired, keeps its controls inert until script and drops the root aria-hidden",
    (file, name) => {
      const source = read(file);
      expect(source).toContain(`data-interact="${name}"`);
      expect(source).toMatch(/<button type="button"[^>]* inert>/);
      expect(source).not.toMatch(/data-scene[^>]*aria-hidden/);
    },
  );
});

describe("approval overlays", () => {
  const css = readFileSync(
    new URL("../../../../styles/bento/approval.css", import.meta.url),
    "utf8",
  );

  it.each([".approval-stamp", ".approval-cursor"])(
    "%s lets pointer events through to the button",
    (selector) => {
      const rule = new RegExp(`^${selector.replace(".", "\\.")} \\{[^}]*\\}`, "m").exec(css);
      expect(rule?.[0]).toContain("pointer-events: none;");
    },
  );
});
