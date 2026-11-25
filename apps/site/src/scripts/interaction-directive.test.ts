import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import interactionDirective from "./interaction-directive";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("interaction directive", () => {
  test("hydrates the island element on its first interaction", async () => {
    const element = document.createElement("div");
    let loaded = 0;
    const load = () => {
      loaded += 1;
      return Promise.resolve(() => Promise.resolve());
    };
    interactionDirective(load, { name: "interaction", value: "" }, element);
    expect(loaded).toBe(0);
    element.dispatchEvent(new Event("focusin"));
    await Promise.resolve();
    expect(loaded).toBe(1);
  });
});
