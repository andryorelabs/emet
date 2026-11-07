import { afterEach, expect, test } from "bun:test";

import { copyWithFeedback, FEEDBACK_MS } from "./copy-feedback";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function stubNavigator(value: unknown): void {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

test("copyWithFeedback writes the plain text and reports copied", async () => {
  const written: string[] = [];
  stubNavigator({
    clipboard: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  expect(await copyWithFeedback("bun add emet")).toBe("copied");
  expect(written).toEqual(["bun add emet"]);
});

test("copyWithFeedback reports failed when the clipboard rejects", async () => {
  stubNavigator({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  expect(await copyWithFeedback("x")).toBe("failed");
});

test("copyWithFeedback reports failed when the clipboard is missing", async () => {
  stubNavigator({});
  expect(await copyWithFeedback("x")).toBe("failed");
});

test("the feedback state lasts two seconds", () => {
  expect(FEEDBACK_MS).toBe(2000);
});
