import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { readFileSync } from "node:fs";

import { initCiRerun, restartScene } from "./ci-rerun";
import { asElement, FakeElement } from "./fake-dom";
import { registerScene } from "./registry";
import {
  initTrackerChips,
  TRACKER_IDLE_MS,
  TRACKER_SWAP_MS,
  trackerRow,
  type TrackerKind,
} from "./tracker-chips";
import {
  createTyper,
  initWorkerDiff,
  TYPE_DURATION_MS,
  TYPE_INTERVAL_MS,
  TYPE_STEPS,
  typedPrefix,
} from "./worker-diff";

const globals = globalThis as Record<string, unknown>;

/**
 * A fake element that also answers `querySelectorAll` from a list map.
 */
class FakeScene extends FakeElement {
  lists = new Map<string, FakeElement[]>();

  querySelectorAll(selector: string): FakeElement[] {
    return this.lists.get(selector) ?? [];
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  delete globals.matchMedia;
});

describe("restartScene and initCiRerun", () => {
  it("resets the offset and toggles the restart flag around a reflow", () => {
    const scene = new FakeScene();
    restartScene(asElement(scene));
    expect(scene.styleValues.get("--scene-offset")).toBe("0s");
    expect(scene.dataset.restart).toBeUndefined();
  });

  it("does nothing without a button", () => {
    initCiRerun(asElement(new FakeScene()));
  });

  it("enables the button and restarts on click", () => {
    const scene = new FakeScene();
    const button = new FakeElement();
    scene.children.set(".ci-rerun", button);
    initCiRerun(asElement(scene));
    expect(button.inert).toBe(false);
    button.fire("click");
    expect(scene.styleValues.get("--scene-offset")).toBe("0s");
  });
});

describe("trackerRow", () => {
  it.each<[TrackerKind, string, string]>([
    ["linear", "CLA-254", "Done"],
    ["github", "#254", "closed"],
    ["local", "tickets/254.md", "status: done"],
  ])("writes %s rows", (kind, id, state) => {
    expect(trackerRow(kind, 254)).toEqual({ id, state });
  });
});

function makeTracker(): {
  scene: FakeScene;
  chips: FakeElement[];
  id: FakeElement;
  closed: FakeElement;
} {
  const scene = new FakeScene();
  const chips = (["linear", "github", "local"] as const).map((kind) => {
    const chip = new FakeElement();
    chip.dataset.kind = kind;
    return chip;
  });
  const id = new FakeElement();
  id.textContent = "CLA-254";
  const closed = new FakeElement();
  closed.textContent = "closed";
  scene.lists.set(".tracker-chip", chips);
  scene.children.set(".tracker-id", id);
  scene.children.set(".tracker-status.is-closed", closed);
  initTrackerChips(asElement(scene));
  return { scene, chips, id, closed };
}

describe("initTrackerChips", () => {
  it("does nothing when a part is missing", () => {
    initTrackerChips(asElement(new FakeScene()));
  });

  it("swaps the row and presses the chosen chip", () => {
    const { scene, chips, id, closed } = makeTracker();
    expect(chips[0]?.inert).toBe(false);
    chips[0]?.fire("click");
    expect(scene.dataset.manual).toBe("");
    expect(scene.styleValues.get("--tracker-selected")).toBe("0");
    expect(chips[0]?.attributes.get("aria-pressed")).toBe("true");
    expect(chips[1]?.attributes.get("aria-pressed")).toBe("false");
    expect(id.dataset.swap).toBe("");
    jest.advanceTimersByTime(TRACKER_SWAP_MS);
    expect(id.textContent).toBe("CLA-254");
    expect(closed.textContent).toBe("Done");
    chips[2]?.fire("click");
    jest.advanceTimersByTime(TRACKER_SWAP_MS);
    expect(id.textContent).toBe("tickets/254.md");
    expect(id.dataset.swap).toBeUndefined();
  });

  it("ignores a chip with an unknown kind", () => {
    const { scene, chips } = makeTracker();
    if (chips[1] !== undefined) chips[1].dataset.kind = "jira";
    chips[1]?.fire("click");
    expect(scene.dataset.manual).toBeUndefined();
  });

  it("returns to auto after 9 s idle and not before", () => {
    const { scene, chips, id, closed } = makeTracker();
    chips[1]?.fire("click");
    jest.advanceTimersByTime(TRACKER_SWAP_MS);
    expect(id.textContent).toBe("#254");
    jest.advanceTimersByTime(TRACKER_IDLE_MS - TRACKER_SWAP_MS - 1);
    expect(scene.dataset.manual).toBe("");
    jest.advanceTimersByTime(1);
    expect(scene.dataset.manual).toBeUndefined();
    expect(chips.every((chip) => chip.attributes.get("aria-pressed") === "false")).toBe(true);
    jest.advanceTimersByTime(TRACKER_SWAP_MS);
    expect(id.textContent).toBe("CLA-254");
    expect(closed.textContent).toBe("closed");
  });

  it("restarts the idle window on every click", () => {
    const { scene, chips } = makeTracker();
    chips[0]?.fire("click");
    jest.advanceTimersByTime(TRACKER_IDLE_MS - 1000);
    chips[1]?.fire("click");
    jest.advanceTimersByTime(TRACKER_IDLE_MS - 1);
    expect(scene.dataset.manual).toBe("");
    jest.advanceTimersByTime(1);
    expect(scene.dataset.manual).toBeUndefined();
  });
});

describe("typedPrefix", () => {
  it("bounds the count to the text", () => {
    expect(typedPrefix("abc", 2)).toBe("ab");
    expect(typedPrefix("abc", 9)).toBe("abc");
    expect(typedPrefix("abc", -1)).toBe("");
  });
});

describe("typing cadence", () => {
  it("types a 16 character diff in 0.7 s over 16 steps", () => {
    expect(TYPE_DURATION_MS).toBe(700);
    expect(TYPE_STEPS).toBe(16);
    expect(TYPE_INTERVAL_MS * TYPE_STEPS).toBe(TYPE_DURATION_MS);
  });
});

describe("createTyper", () => {
  it("types one character per tick and then stops ticking", () => {
    const seen: string[] = [];
    const typer = createTyper({ text: "+ab", instant: false, render: (value) => seen.push(value) });
    typer.start();
    jest.advanceTimersByTime(TYPE_INTERVAL_MS * 5);
    expect(seen).toEqual(["", "+", "+a", "+ab"]);
  });

  it("shows everything at once when instant", () => {
    const seen: string[] = [];
    createTyper({ text: "+ab", instant: true, render: (value) => seen.push(value) }).start();
    expect(seen).toEqual(["+ab"]);
  });

  it("clears on stop and cancels a running timer", () => {
    const seen: string[] = [];
    const typer = createTyper({ text: "+ab", instant: false, render: (value) => seen.push(value) });
    typer.start();
    jest.advanceTimersByTime(TYPE_INTERVAL_MS);
    typer.stop();
    jest.advanceTimersByTime(TYPE_INTERVAL_MS * 5);
    expect(seen).toEqual(["", "+", ""]);
  });
});

function makeBox(
  diff: string | undefined,
  withMini = true,
): { box: FakeElement; mini: FakeElement } {
  const box = new FakeElement();
  const mini = new FakeElement();
  if (diff !== undefined) box.dataset.diff = diff;
  if (withMini) box.children.set(".trees-mini", mini);
  return { box, mini };
}

function wireBoxes(boxes: FakeElement[], reduced = false): void {
  globals.matchMedia = () => ({ matches: reduced });
  const scene = new FakeScene();
  scene.lists.set(".trees-box", boxes);
  initWorkerDiff(asElement(scene));
}

describe("initWorkerDiff", () => {
  it("skips boxes without a mini line or a diff but still enables them", () => {
    const first = makeBox("+ x", false);
    const second = makeBox(undefined);
    wireBoxes([first.box, second.box]);
    expect(first.box.inert).toBe(false);
    first.box.fire("pointerenter");
    expect(first.box.dataset.typing).toBeUndefined();
  });

  it("types on hover and clears on leave", () => {
    const { box, mini } = makeBox("+ ab");
    wireBoxes([box]);
    box.fire("pointerenter");
    expect(box.dataset.typing).toBe("");
    jest.advanceTimersByTime(TYPE_INTERVAL_MS * 2);
    expect(mini.textContent).toBe("+ ");
    box.fire("pointerleave");
    expect(box.dataset.typing).toBeUndefined();
    expect(mini.textContent).toBe("");
  });

  it("types on focus and keeps typing while hover or focus remains", () => {
    const { box, mini } = makeBox("+ ab");
    wireBoxes([box]);
    box.fire("focus");
    box.fire("pointerenter");
    jest.advanceTimersByTime(TYPE_INTERVAL_MS * 4);
    expect(mini.textContent).toBe("+ ab");
    box.fire("pointerleave");
    expect(box.dataset.typing).toBe("");
    expect(mini.textContent).toBe("+ ab");
    box.fire("blur");
    expect(box.dataset.typing).toBeUndefined();
    expect(mini.textContent).toBe("");
  });

  it("shows the whole diff at once with reduced motion", () => {
    const { box, mini } = makeBox("+ ab");
    wireBoxes([box], true);
    box.fire("focus");
    expect(mini.textContent).toBe("+ ab");
  });
});

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("scene markup and stylesheets", () => {
  it.each([
    ["CiScene.astro", "ci", /<button type="button" class="ci-rerun" inert>/],
    ["WorkersScene.astro", "workers", /<button type="button" class="trees-box"[^>]* inert>/],
    ["TrackerScene.astro", "tracker", /<button[^>]* class="tracker-chip"[^>]* inert>/],
  ])("%s is wired, inert until script and not aria-hidden at the root", (file, name, button) => {
    const source = read(`../scenes/${file}`);
    expect(source).toContain(`data-interact="${name}"`);
    expect(source).toMatch(button);
    expect(source).not.toMatch(/data-scene[^>]*aria-hidden/);
    expect(source).toContain(`registerScene("${name}"`);
  });

  it("registers a scene init that the registry can wire", () => {
    registerScene("ci", initCiRerun);
  });

  it("keeps the tracker chips pressable and the diff lines in the ci scene", () => {
    expect(read("../scenes/TrackerScene.astro")).toContain('aria-pressed="false"');
    expect(read("../scenes/CiScene.astro")).toContain("- retries: 0");
    expect(read("../scenes/CiScene.astro")).toContain("+ retries: 3");
  });
});
