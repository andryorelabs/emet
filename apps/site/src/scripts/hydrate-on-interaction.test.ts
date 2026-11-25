import { describe, expect, mock, test } from "bun:test";

import { hydrateOnInteraction, INTERACTION_EVENTS } from "./hydrate-on-interaction";

class FakeRoot extends EventTarget {
  click = mock();
}

const REPLAY_WAIT_MS = 120;

function setup() {
  const root = new FakeRoot();
  const hydrate = mock(() => Promise.resolve());
  const loading = Promise.withResolvers<() => Promise<void>>();
  const load = mock(() => loading.promise);
  hydrateOnInteraction(root, load);
  return {
    root,
    load,
    hydrate,
    finishLoading: () => {
      loading.resolve(hydrate);
    },
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("hydrateOnInteraction", () => {
  test("does not load before any interaction", () => {
    const { load } = setup();
    expect(load).not.toHaveBeenCalled();
  });

  test.each(INTERACTION_EVENTS)("loads once on the first %s", (type) => {
    const { root, load } = setup();
    root.dispatchEvent(new Event(type));
    root.dispatchEvent(new Event(type));
    root.dispatchEvent(new Event("focusin"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("replays a click that landed before hydration", async () => {
    const { root, hydrate, finishLoading } = setup();
    root.dispatchEvent(new Event("touchstart"));
    root.dispatchEvent(new Event("click"));
    expect(root.click).not.toHaveBeenCalled();
    finishLoading();
    await wait(REPLAY_WAIT_MS);
    expect(root.click).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  test("suppresses the native action of a click that landed before hydration", () => {
    const { root } = setup();
    root.dispatchEvent(new Event("touchstart"));
    const click = new Event("click", { cancelable: true });
    root.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  test("does not replay without an early click", async () => {
    const { root, hydrate, finishLoading } = setup();
    root.dispatchEvent(new Event("focusin"));
    finishLoading();
    await wait(REPLAY_WAIT_MS);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(root.click).not.toHaveBeenCalled();
  });
});
