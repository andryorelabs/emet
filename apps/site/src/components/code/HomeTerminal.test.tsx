import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { renderToString } from "react-dom/server";

import { renderIsland } from "../../test/render";
import { HomeTerminal, type HomeTerminalLine } from "./HomeTerminal";

const lines: readonly HomeTerminalLine[] = [
  { text: "emet status", kind: "command" },
  { text: "wave 1  #42", kind: "output" },
  { text: "spec/41. Each wave joins one spec branch.", kind: "output", muted: true },
];

function mockReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function shownText(root: ParentNode): string[] {
  return [...root.querySelectorAll("[data-terminal-line]")].map((line) => line.textContent);
}

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("HomeTerminal", () => {
  test("server markup shows the final lines with no inline style", () => {
    const parsed = new DOMParser().parseFromString(
      renderToString(<HomeTerminal lines={lines} />),
      "text/html",
    );
    expect(shownText(parsed)).toEqual(lines.map((line) => line.text));
    expect(parsed.querySelectorAll("[style]")).toHaveLength(0);
  });

  test("reduced motion keeps the final lines", () => {
    mockReducedMotion(true);
    const { container, unmount } = renderIsland(<HomeTerminal lines={lines} />);
    expect(shownText(container)).toEqual(lines.map((line) => line.text));
    unmount();
  });

  test("with motion allowed the command is typed from empty", () => {
    mockReducedMotion(false);
    const { container, unmount } = renderIsland(<HomeTerminal lines={lines} startOnView={false} />);
    expect(container.querySelector("[data-terminal-animated]")).not.toBeNull();
    expect(shownText(container)[0]).toBe("");
    unmount();
  });
});
