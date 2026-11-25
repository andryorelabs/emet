import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import {
  announceHeaderMenuOpen,
  HEADER_MENU_OPEN_EVENT,
  onOtherHeaderMenuOpen,
} from "./header-menu-events";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("header menu events", () => {
  test("closes a menu when another one announces it is opening", () => {
    let closed = 0;
    let received: Element | undefined;
    const stop = onOtherHeaderMenuOpen("theme", (source) => {
      closed += 1;
      received = source;
    });
    announceHeaderMenuOpen("language", document.body);
    expect(closed).toBe(1);
    expect(received).toBe(document.body);
    stop();
  });

  test("ignores the announcement of the menu itself", () => {
    let closed = 0;
    const stop = onOtherHeaderMenuOpen("theme", () => {
      closed += 1;
    });
    announceHeaderMenuOpen("theme", document.body);
    expect(closed).toBe(0);
    stop();
  });

  test("stops listening after the returned remover runs", () => {
    let closed = 0;
    const stop = onOtherHeaderMenuOpen("theme", () => {
      closed += 1;
    });
    stop();
    announceHeaderMenuOpen("language", document.body);
    expect(closed).toBe(0);
  });

  test("dispatches the id and source as the event detail", () => {
    let detail: unknown;
    const listener = (event: Event): void => {
      detail = event instanceof CustomEvent ? event.detail : undefined;
    };
    document.addEventListener(HEADER_MENU_OPEN_EVENT, listener);
    announceHeaderMenuOpen("mobile-menu", document.body);
    document.removeEventListener(HEADER_MENU_OPEN_EVENT, listener);
    expect(detail).toEqual({ id: "mobile-menu", source: document.body });
  });
});
