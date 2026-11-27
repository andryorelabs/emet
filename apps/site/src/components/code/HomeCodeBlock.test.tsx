import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { renderToString } from "react-dom/server";

import { FEEDBACK_MS } from "../../lib/copy-feedback";
import { renderIsland } from "../../test/render";
import { CODE_BLOCK_STYLE_ATTRIBUTES } from "./code-block-style-attributes";
import { HomeCodeBlock } from "./HomeCodeBlock";

const INSTALL = "curl -fsSL https://emet.andryore.dev/install.sh | sh";
const strings = { copy: "Copiar", copied: "Copiado" };

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  document.body.innerHTML = "";
});

function serverMarkup(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToString(node), "text/html");
}

describe("HomeCodeBlock server markup", () => {
  test("shows each line as plain text without highlighting", () => {
    const parsed = serverMarkup(
      <HomeCodeBlock code={"wave 1  #42\nwave 2  #43"} lang="text" strings={strings} />,
    );
    const lines = [...parsed.querySelectorAll("[data-slot=code-block-line]")].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual(["wave 1  #42", "wave 2  #43"]);
  });

  test("carries no inline style beyond the hashed counter reset", () => {
    const parsed = serverMarkup(
      <HomeCodeBlock code={INSTALL} lang="bash" prompt strings={strings} />,
    );
    const values = new Set(
      [...parsed.querySelectorAll("[style]")].map((node) => node.getAttribute("style") ?? ""),
    );
    expect([...values]).toEqual([...CODE_BLOCK_STYLE_ATTRIBUTES]);
  });

  test("wraps long lines instead of scrolling them", () => {
    const parsed = serverMarkup(<HomeCodeBlock code={INSTALL} lang="bash" strings={strings} />);
    expect(parsed.querySelector("pre")?.hasAttribute("data-wrap")).toBe(true);
  });

  test("marks the prompt as decoration", () => {
    const parsed = serverMarkup(
      <HomeCodeBlock code={INSTALL} lang="bash" prompt strings={strings} />,
    );
    const marker = parsed.querySelector("[data-slot=code-block-line] [aria-hidden=true]");
    expect(marker?.textContent).toBe("$ ");
  });
});

function mockClipboard(): string[] {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return written;
}

describe("HomeCodeBlock on the client", () => {
  test("copies the exact command, without the prompt, and announces it", async () => {
    const written = mockClipboard();
    const { container, unmount } = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="bash" prompt strings={strings} />,
    );
    const button = container.querySelector<HTMLButtonElement>("[data-home-code-copy]");
    expect(button?.getAttribute("aria-label")).toBe("Copiar");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(written).toEqual([INSTALL]);
    expect(button?.getAttribute("aria-label")).toBe("Copiado");
    expect(container.querySelector("[aria-live=polite]")?.textContent).toBe("Copiado");
    unmount();
  });

  test("returns to the copy label after the feedback delay", async () => {
    mockClipboard();
    jest.useFakeTimers();
    const { container, unmount } = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="text" strings={strings} />,
    );
    const button = container.querySelector<HTMLButtonElement>("[data-home-code-copy]");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(button?.getAttribute("aria-label")).toBe("Copiado");
    act(() => {
      jest.advanceTimersByTime(FEEDBACK_MS);
    });
    expect(button?.getAttribute("aria-label")).toBe("Copiar");
    jest.useRealTimers();
    unmount();
  });

  test("tells the companion about a copy and omits the button when not copyable", async () => {
    mockClipboard();
    let events = 0;
    const listener = (): void => {
      events += 1;
    };
    addEventListener("emet:copy", listener);
    const { container, unmount } = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="text" strings={strings} />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-home-code-copy]")?.click();
      await Promise.resolve();
    });
    expect(events).toBe(1);
    removeEventListener("emet:copy", listener);
    unmount();
    const plain = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="text" strings={strings} copyable={false} />,
    );
    expect(plain.container.querySelector("[data-home-code-copy]")).toBeNull();
    plain.unmount();
  });

  test("keeps the copy label when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("denied")),
      },
    });
    const { container, unmount } = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="bash" strings={strings} />,
    );
    const button = container.querySelector<HTMLButtonElement>("[data-home-code-copy]");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(button?.getAttribute("aria-label")).toBe("Copiar");
    unmount();
  });

  test("highlights bash with shiki once the highlighter loads", async () => {
    const { container, unmount } = renderIsland(
      <HomeCodeBlock code={INSTALL} lang="bash" strings={strings} />,
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    });
    const line = container.querySelector("[data-slot=code-block-line]");
    expect(line?.textContent).toBe(INSTALL);
    expect(line?.querySelectorAll("span[class*=shiki]").length).toBeGreaterThan(1);
    unmount();
  });
});
