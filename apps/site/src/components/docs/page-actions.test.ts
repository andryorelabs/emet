import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { PAGE_ACTIONS_STRINGS } from "../../docs/page-actions-strings";
import { LOCALES } from "../../i18n/locales";
import { buildOpenInPrompt, buildOpenInUrl, shouldHandleArrowKey } from "./page-actions";

const bare = { key: "ArrowRight", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
const PAGE_URL = "https://emet.andryore.dev/docs/guide/fleet/";

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
      const labels: Record<string, string> = { ...PAGE_ACTIONS_STRINGS[locale] };
      for (const [key, value] of Object.entries(labels)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("menu item icons", () => {
  const source = readFileSync(new URL("./PageActions.astro", import.meta.url), "utf8");
  const menuItems = source.match(/<a role="menuitem"[\s\S]*?<\/a>/g) ?? [];

  test("renders three menu items", () => {
    expect(menuItems).toHaveLength(3);
  });

  test("gives each menu item an inline decorative currentColor icon", () => {
    for (const item of menuItems) {
      expect(item).toContain(`<svg class="page-actions-menu-icon" aria-hidden="true"`);
      expect(item).toContain(`focusable="false"`);
      expect(item).toContain(`fill="currentColor"`);
    }
  });

  test("loads no icon from an external source", () => {
    expect(source).not.toContain("<img");
    expect(source).not.toMatch(/<svg[^>]*href="http/);
    expect(source).not.toMatch(/<use[^>]*href="http/);
    expect(source).not.toMatch(/url\(\s*["']?https?:/);
  });
});
