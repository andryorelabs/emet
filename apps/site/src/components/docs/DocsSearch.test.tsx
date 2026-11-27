import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, createContext, type ReactNode, use, useEffect } from "react";

import {
  SEARCH_PENDING_ATTRIBUTE,
  SEARCH_REQUEST_EVENT,
  type SearchRequestMode,
} from "../../docs/search-markup";
import type { RenderedIsland } from "../../test/render";
import type { DocsSearchStrings } from "./DocsSearch";

/**
 * Base UI decides at import time whether layout effects exist, so a module
 * another test file loaded without a DOM keeps them off for the whole run. The
 * dialog is a plain stand-in here; Escape and focus return belong to Base UI.
 */

const strings: DocsSearchStrings = {
  label: "Search documentation",
  cancel: "Cancel",
  token: "[SEARCH_TERM]",
  searching: "Searching…",
  noResults: "Nothing matches “[SEARCH_TERM]”.",
  footerPrivacy: "Search runs in your browser.",
  footerKeys: "↑↓ to move, Enter to open",
  escapeKey: "Esc",
  unavailable: "Search is only available in production builds.",
};

const focusTargets: { initial?: unknown; final?: unknown } = {};
const CloseContext = createContext<(open: boolean) => void>(() => undefined);

const realDialog = await import("@/components/ui/dialog");

await mock.module("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
  }) => (open ? <CloseContext value={onOpenChange}>{children}</CloseContext> : null),
  DialogContent: ({
    children,
    initialFocus,
    finalFocus,
    "data-standalone": standalone,
    "data-search-part": part,
  }: {
    children: ReactNode;
    initialFocus: () => unknown;
    finalFocus: () => unknown;
    "data-standalone"?: string;
    "data-search-part"?: string;
  }) => {
    useEffect(() => {
      focusTargets.initial = initialFocus();
      return () => {
        focusTargets.final = finalFocus();
      };
    }, [initialFocus, finalFocus]);
    return (
      <div role="dialog" data-search-part={part} data-standalone={standalone}>
        {children}
      </div>
    );
  },
  DialogTitle: ({ children }: { children: ReactNode }) => (
    <h2 data-slot="dialog-title">{children}</h2>
  ),
  DialogClose: ({ children }: { children: ReactNode }) => {
    const close = use(CloseContext);
    return (
      <button
        type="button"
        data-search-part="cancel"
        onClick={() => {
          close(false);
        }}
      >
        {children}
      </button>
    );
  },
}));

GlobalRegistrator.register();
const { DocsSearch } = await import("./DocsSearch");
const { renderIsland } = await import("../../test/render");
await GlobalRegistrator.unregister();

let island: RenderedIsland | undefined;
let fixture: HTMLElement | undefined;

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await mock.module("@/components/ui/dialog", () => realDialog);
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  island?.unmount();
  island = undefined;
  fixture?.remove();
  fixture = undefined;
  document.body.innerHTML = "";
});

/**
 * Finds an element the test expects on the page.
 * @param selector - The CSS selector.
 * @returns The first match.
 * @throws {Error} When nothing matches.
 */
function getElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

/**
 * Builds the markup Starlight's `Search` leaves on the page: the root, the
 * hidden Pagefind container and a trigger.
 * @param pending - A request the page script made before hydration.
 * @returns The search root.
 */
function mountPage(pending?: SearchRequestMode): HTMLElement {
  fixture = document.createElement("div");
  const pendingAttribute = pending ? ` ${SEARCH_PENDING_ATTRIBUTE}="${pending}"` : "";
  fixture.innerHTML = `<button data-search-trigger>Search</button>
    <div class="docs-search" data-docs-search="{}"${pendingAttribute}>
      <site-search><dialog><div class="dialog-frame"><div class="search-container"><div id="starlight__search">
        <input class="pagefind-ui__search-input" />
        <p class="pagefind-ui__message"></p>
      </div></div></div></dialog></site-search>
    </div>`;
  document.body.append(fixture);
  return getElement("[data-docs-search]");
}

/**
 * Sends the root an open or toggle request, as the page script does.
 * @param root - The search root.
 * @param mode - What the request asks for.
 */
function request(root: HTMLElement, mode: SearchRequestMode): void {
  act(() => {
    root.dispatchEvent(new CustomEvent(SEARCH_REQUEST_EVENT, { detail: mode }));
  });
}

/**
 * Appends a result link to Pagefind's output.
 * @param onClick - Called when the link is followed.
 * @returns The link.
 */
function addResultLink(onClick: () => void = () => undefined): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "pagefind-ui__result-link";
  link.href = "#result";
  link.scrollIntoView = () => undefined;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  act(() => {
    document.querySelector("#starlight__search")?.append(link);
  });
  return link;
}

/**
 * Lets the dialog finish closing, as it unmounts after its exit transition.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe("DocsSearch", () => {
  test("renders no dialog until a request opens it", () => {
    mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    expect(document.querySelector('[data-search-part="dialog"]')).toBeNull();
  });

  test("opens on a request and adopts Pagefind's container", () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    const dialog = document.querySelector('[data-search-part="dialog"]');
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.querySelector("#starlight__search")).not.toBeNull();
    expect(dialog?.textContent).toContain(strings.footerPrivacy);
    expect(dialog?.querySelector('[data-search-part="esc"]')?.textContent).toBe("Esc");
  });

  test("labels the dialog and marks the standalone page", () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} standalone />);
    request(root, "open");
    const dialog = document.querySelector('[data-search-part="dialog"]');
    expect(dialog?.hasAttribute("data-standalone")).toBe(true);
    expect(dialog?.querySelector("[data-slot=dialog-title]")?.textContent).toBe(strings.label);
  });

  test("toggle closes an open dialog and returns the container", async () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "toggle");
    expect(document.querySelector('[data-search-part="dialog"] #starlight__search')).not.toBeNull();
    request(root, "toggle");
    await settle();
    expect(document.querySelector('[data-search-part="dialog"]')).toBeNull();
    expect(document.querySelector(".docs-search .search-container")).not.toBeNull();
  });

  test("an open request keeps an open dialog open", () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    request(root, "open");
    expect(document.querySelector('[data-search-part="dialog"]')).not.toBeNull();
  });

  test("opens at once for a request made before hydration", () => {
    const root = mountPage("open");
    island = renderIsland(<DocsSearch strings={strings} />);
    expect(document.querySelector('[data-search-part="dialog"]')).not.toBeNull();
    expect(root.hasAttribute(SEARCH_PENDING_ATTRIBUTE)).toBe(false);
  });

  test("reports the state of Pagefind's output", async () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    const frame = document.querySelector('[data-search-part="frame"]');
    expect(frame?.getAttribute("data-search-state")).toBe("idle");
    await act(async () => {
      const message = document.querySelector(".pagefind-ui__message");
      if (message) message.textContent = "Searching…";
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(frame?.getAttribute("data-search-state")).toBe("searching");
    expect(document.querySelector('[data-search-part="status"]')?.textContent).toBe("Searching…");
  });

  test("Enter on the query field follows the first result", () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    let followed = 0;
    addResultLink(() => {
      followed += 1;
    });
    const input = getElement(".pagefind-ui__search-input");
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(followed).toBe(1);
  });

  test("arrow keys move between the field and the results", () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    const link = addResultLink();
    const input = getElement(".pagefind-ui__search-input");
    input.scrollIntoView = () => undefined;
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).toBe(link);
    act(() => {
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(document.activeElement).toBe(input);
  });

  test("closes when a result link is followed", async () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    const link = addResultLink();
    act(() => {
      link.click();
    });
    await settle();
    expect(document.querySelector('[data-search-part="dialog"]')).toBeNull();
    expect(document.querySelector(".docs-search .search-container")).not.toBeNull();
  });

  test("focuses the query field on open and the header trigger on close", async () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    expect(focusTargets.initial).toBe(getElement(".pagefind-ui__search-input"));
    request(root, "toggle");
    await settle();
    expect(focusTargets.final).toBe(getElement("[data-search-trigger]"));
  });

  test("the cancel button closes the dialog and returns the container", async () => {
    const root = mountPage();
    island = renderIsland(<DocsSearch strings={strings} />);
    request(root, "open");
    act(() => {
      getElement('[data-search-part="cancel"]').click();
    });
    await settle();
    expect(document.querySelector('[data-search-part="dialog"]')).toBeNull();
    expect(document.querySelector(".docs-search .search-container")).not.toBeNull();
  });

  test("shows the unavailable state when Starlight rendered no search container", () => {
    fixture = document.createElement("div");
    fixture.innerHTML = `<button data-search-trigger>Search</button><div class="docs-search" data-docs-search="{}"></div>`;
    document.body.append(fixture);
    island = renderIsland(<DocsSearch strings={strings} />);
    request(getElement("[data-docs-search]"), "open");
    const frame = getElement('[data-search-part="frame"]');
    expect(frame.getAttribute("data-search-state")).toBe("unavailable");
    expect(frame.querySelector('[data-slot="empty"]')?.textContent).toContain(strings.unavailable);
    expect(getElement('[data-search-part="status"]').textContent).toBe(strings.unavailable);
  });
});
