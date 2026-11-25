import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";

import { PAGE_ACTIONS_STRINGS } from "../../docs/page-actions-strings";
import { LOCALES } from "../../i18n/locales";
import { FEEDBACK_MS } from "../../lib/copy-feedback";
import { renderIsland } from "../../test/render";
import {
  BrandIcon,
  PageActions,
  buildOpenInPrompt,
  buildOpenInUrl,
  shouldHandleArrowKey,
} from "./PageActions";

const bare = { key: "ArrowRight", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
const PAGE_URL = "https://emet.andryore.dev/docs/guide/fleet/";
const TWIN_URL = "/docs/guide/fleet.md";
const labels = PAGE_ACTIONS_STRINGS.en;

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buildOpenInUrl", () => {
  test("opens Claude with the encoded prompt", () => {
    expect(buildOpenInUrl("claude", PAGE_URL)).toBe(
      `https://claude.ai/new?q=${encodeURIComponent(buildOpenInPrompt(PAGE_URL))}`,
    );
  });

  test("opens ChatGPT with the encoded prompt", () => {
    expect(buildOpenInUrl("chatgpt", PAGE_URL)).toStartWith("https://chatgpt.com/?q=");
  });

  test("keeps the prompt in English", () => {
    expect(buildOpenInPrompt(PAGE_URL)).toBe(
      "I'm looking at this emet documentation: https://emet.andryore.dev/docs/guide/fleet/. Help me understand how to use it. Be ready to explain concepts, give examples, or help debug based on it.",
    );
  });
});

describe("shouldHandleArrowKey", () => {
  test("handles both arrows on the page body", () => {
    expect(shouldHandleArrowKey(bare, { tagName: "BODY" })).toBe(true);
    expect(shouldHandleArrowKey({ ...bare, key: "ArrowLeft" }, {})).toBe(true);
  });

  test("ignores other keys", () => {
    expect(shouldHandleArrowKey({ ...bare, key: "ArrowUp" }, {})).toBe(false);
  });

  test("ignores text fields, selects and contenteditable", () => {
    for (const tagName of ["INPUT", "textarea", "SELECT"]) {
      expect(shouldHandleArrowKey(bare, { tagName })).toBe(false);
    }
    expect(shouldHandleArrowKey(bare, { tagName: "DIV", isContentEditable: true })).toBe(false);
    expect(shouldHandleArrowKey(bare, { tagName: "SPAN", closest: () => ({}) })).toBe(false);
    expect(shouldHandleArrowKey(bare, { tagName: "SPAN", closest: () => null })).toBe(true);
  });

  test("ignores tabs, menus, dialogs and code blocks that own the arrow keys", () => {
    const selectors: string[] = [];
    shouldHandleArrowKey(bare, {
      tagName: "BUTTON",
      closest: (selector) => {
        selectors.push(selector);
        return null;
      },
    });
    for (const owner of ["[role=tab]", "[role=menuitem]", "dialog", "pre"]) {
      expect(selectors[0]).toContain(owner);
    }
  });

  test("ignores any modifier", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) {
      expect(shouldHandleArrowKey({ ...bare, [modifier]: true }, {})).toBe(false);
    }
  });
});

describe("PAGE_ACTIONS_STRINGS", () => {
  test("fills every label in all ten locales", () => {
    expect(Object.keys(PAGE_ACTIONS_STRINGS).toSorted()).toEqual([...LOCALES].toSorted());
    for (const locale of LOCALES) {
      const entries: Record<string, string> = { ...PAGE_ACTIONS_STRINGS[locale] };
      for (const [key, value] of Object.entries(entries)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("PageActions", () => {
  const prev = { href: "/docs/guide/a/", label: "A" };
  const next = { href: "/docs/guide/b/", label: "B" };

  test("renders the copy button, the menu toggle and the pager", () => {
    const { container, unmount } = renderIsland(
      <PageActions
        markdownUrl={TWIN_URL}
        pageUrl={PAGE_URL}
        labels={labels}
        prev={prev}
        next={next}
      />,
    );
    expect(container.querySelector("[data-page-copy]")?.textContent).toBe(labels.copyPage);
    const toggle = container.querySelector(`[aria-label="${labels.moreActions}"]`);
    expect(toggle?.getAttribute("aria-haspopup")).toBe("menu");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[rel="prev"]')?.getAttribute("href")).toBe(prev.href);
    expect(container.querySelector('[rel="next"]')?.getAttribute("href")).toBe(next.href);
    unmount();
  });

  test("marks a missing neighbour as a disabled link", () => {
    const { container, unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    expect(disabled).toHaveLength(2);
    unmount();
  });

  test("keeps the menu items out of the page until the menu opens", () => {
    const { unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    expect(document.querySelectorAll("[role=menuitem]")).toHaveLength(0);
    unmount();
  });

  test("copies the markdown twin and shows the feedback", async () => {
    const written: string[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("# Fleet"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
    const { container, unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>("[data-page-copy]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetchSpy).toHaveBeenCalledWith(TWIN_URL);
    expect(written).toEqual(["# Fleet"]);
    expect(container.querySelector("[data-page-copy]")?.textContent).toBe(labels.copied);
    expect(container.querySelector("[role=status]")?.textContent).toBe(labels.copied);
    unmount();
    fetchSpy.mockRestore();
  });

  test("shows the failed feedback when the twin cannot be fetched", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no", { status: 404 }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
    const { container, unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>("[data-page-copy]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector("[data-page-copy]")?.textContent).toBe(labels.copyFailed);
    unmount();
    fetchSpy.mockRestore();
  });
});

describe("PageActions behaviour", () => {
  const prev = { href: "/docs/guide/a/", label: "A" };
  const next = { href: "/docs/guide/b/", label: "B" };

  test("follows the arrow keys to the neighbouring pages", () => {
    const assign = spyOn(globalThis.location, "assign").mockImplementation(() => undefined);
    const { unmount } = renderIsland(
      <PageActions
        markdownUrl={TWIN_URL}
        pageUrl={PAGE_URL}
        labels={labels}
        prev={prev}
        next={next}
      />,
    );
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(assign.mock.calls).toEqual([[next.href], [prev.href]]);
    unmount();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(assign).toHaveBeenCalledTimes(2);
    assign.mockRestore();
  });

  test("ignores keys other than the arrows", () => {
    const assign = spyOn(globalThis.location, "assign").mockImplementation(() => undefined);
    const { unmount } = renderIsland(
      <PageActions
        markdownUrl={TWIN_URL}
        pageUrl={PAGE_URL}
        labels={labels}
        prev={prev}
        next={next}
      />,
    );
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(assign).not.toHaveBeenCalled();
    unmount();
    assign.mockRestore();
  });

  test("hands the pending twin to the clipboard where ClipboardItem exists", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("# Fleet"));
    const writes: unknown[][] = [];
    class FakeClipboardItem {
      readonly items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    }
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: unknown[]) => {
          writes.push(items);
          await Promise.resolve();
        },
      },
    });
    const { container, unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>("[data-page-copy]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(writes).toHaveLength(1);
    expect(container.querySelector("[data-page-copy]")?.textContent).toBe(labels.copied);
    Reflect.deleteProperty(globalThis, "ClipboardItem");
    unmount();
    fetchSpy.mockRestore();
  });

  test("stays put when there is no neighbour", () => {
    const assign = spyOn(globalThis.location, "assign").mockImplementation(() => undefined);
    const { unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(assign).not.toHaveBeenCalled();
    unmount();
    assign.mockRestore();
  });

  test("returns the copy button to its label after the feedback", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("# Fleet"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
    const { container, unmount } = renderIsland(
      <PageActions markdownUrl={TWIN_URL} pageUrl={PAGE_URL} labels={labels} />,
    );
    await act(async () => {
      container.querySelector<HTMLElement>("[data-page-copy]")?.click();
      await new Promise((resolve) => setTimeout(resolve, FEEDBACK_MS + 100));
    });
    expect(container.querySelector("[data-page-copy]")?.textContent).toBe(labels.copyPage);
    unmount();
    fetchSpy.mockRestore();
  });

  test("draws the brand icon as a decorative inline glyph", () => {
    const { container, unmount } = renderIsland(<BrandIcon path="M0 0h1v1z" />);
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("fill")).toBe("currentColor");
    expect(icon?.querySelector("path")?.getAttribute("d")).toBe("M0 0h1v1z");
    unmount();
  });
});

describe("menu items", () => {
  const source = readFileSync(new URL("./PageActions.tsx", import.meta.url), "utf8");
  const items = source.match(/<DropdownMenuItem[\s\S]*?<\/DropdownMenuItem>/g) ?? [];

  test("renders three menu items as new-tab links", () => {
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toMatch(/target="_blank"\s+rel="noopener noreferrer"/);
      expect(item).toContain("<BrandIcon");
    }
  });

  test("draws each icon inline, decorative and in currentColor", () => {
    expect(source).toMatch(/<svg\s+aria-hidden="true"\s+focusable="false"/);
    expect(source).toContain(`fill="currentColor"`);
  });

  test("loads no icon from an external source", () => {
    expect(source).not.toContain("<img");
    expect(source).not.toMatch(/<svg[^>]*href="http/);
    expect(source).not.toMatch(/<use[^>]*href="http/);
    expect(source).not.toMatch(/url\(\s*["']?https?:/);
  });
});
