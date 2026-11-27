/**
 * Client module of the companion golem: shows the state for the section in
 * view and the visitor's last action, hides over the hero, follows the pointer
 * with its eyes, can be dragged and springs back, and opens a four-question
 * menu of fixed answers. Under reduced motion the eyes stay still and the drag
 * is off. There is no chat and no model: every string is rendered by the page.
 */
import {
  clampDrag,
  COMPANION_EVENT_NAMES,
  COMPANION_SECTIONS,
  companionState,
  eyeShift,
  IDLE_SLEEP_MS,
  menuTarget,
  sectionAtLine,
  type CompanionEvent,
} from "./state";

const EVENT_MS = 2600;
const ANSWER_MS = 6500;
const DRAG_THRESHOLD = 6;
const EYE_REACH = 400;
const EDGE_GAP = 32;
const SUPPRESS_MS = 60;
const FOOTER_CLEARANCE_PX = 16;
const noop = (): void => undefined;
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reads the numeric detail of an event payload as a held flag.
 * @param event - The event received from a section.
 * @returns `true` when the section reports the wave as held.
 */
function heldOf(event: Event): boolean {
  if (!(event instanceof CustomEvent)) return false;
  const detail: unknown = event.detail;
  return typeof detail === "object" && detail !== null && "held" in detail && detail.held === true;
}

/**
 * Wires one companion element.
 * @param root - The `[data-companion]` element rendered by `Companion.astro`.
 * @param idleMs - How long without input before the golem sleeps.
 * @returns A handle that removes every listener and timer.
 */
export function initCompanion(
  root: HTMLElement,
  idleMs: number = IDLE_SLEEP_MS,
): { destroy(): void } {
  const button = root.querySelector<HTMLButtonElement>("[data-companion-button]");
  const menu = root.querySelector<HTMLElement>("[data-companion-menu]");
  const say = root.querySelector<HTMLElement>("[data-companion-say]");
  const docs = root.querySelector<HTMLAnchorElement>("[data-companion-docs]");
  if (!button || !menu || !say || !docs) return { destroy: noop };

  const items = [...menu.querySelectorAll<HTMLElement>("[role=menuitem]")];
  const reduced = globalThis.matchMedia(REDUCED_QUERY).matches;
  const abort = new AbortController();
  const { signal } = abort;
  let section = "hero";
  let nearFooter = false;
  let event: CompanionEvent | null = null;
  let answer: { text: string; withDocs: boolean } | null = null;
  let eventTimer: ReturnType<typeof setTimeout> | undefined;
  let answerTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let asleep = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;

  const setMenu = (open: boolean): void => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) items[0]?.focus();
  };

  const render = (): void => {
    const state = companionState(section, event, {
      step: Number(document.querySelector<HTMLElement>("#how")?.dataset.step ?? -1),
      held: document.querySelector<HTMLElement>("#showcase")?.dataset.state === "held",
      asleep,
    });
    const away = section === "hero" || nearFooter;
    root.dataset.state = state;
    if (away) root.dataset.away = "";
    else delete root.dataset.away;
    root.inert = away;
    if (away && !menu.hidden) setMenu(false);
    say.textContent = answer?.text ?? root.dataset[state] ?? "";
    docs.hidden = !answer?.withDocs;
  };

  const measure = (): void => {
    frame = 0;
    const rects = COMPANION_SECTIONS.flatMap((entry) => {
      const element = document.querySelector(entry.selector);
      if (!element) return [];
      const { top, bottom } = element.getBoundingClientRect();
      return [{ id: entry.id, top, bottom }];
    });
    section = sectionAtLine(rects, globalThis.innerHeight / 2) || "other";
    const footer = document.querySelector(".site-footer")?.getBoundingClientRect();
    nearFooter =
      !!footer && footer.top < globalThis.innerHeight - root.offsetHeight - FOOTER_CLEARANCE_PX;
    render();
  };

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(measure);
  };

  const react = (next: CompanionEvent): void => {
    event = next;
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => {
      event = null;
      render();
    }, EVENT_MS);
    render();
  };

  const listen = (name: string, handler: (received: Event) => void): void => {
    globalThis.addEventListener(name, handler, { signal });
  };
  listen(COMPANION_EVENT_NAMES.approvalHold, () => {
    react({ kind: "approval-hold" });
  });
  listen(COMPANION_EVENT_NAMES.copy, () => {
    react({ kind: "copy" });
  });
  listen(COMPANION_EVENT_NAMES.flagToggle, (received) => {
    react({ kind: "flag-toggle", held: heldOf(received) });
  });
  const wake = (): void => {
    clearTimeout(idleTimer);
    if (asleep) {
      asleep = false;
      render();
    }
    if (!reduced) {
      idleTimer = setTimeout(() => {
        asleep = true;
        render();
      }, idleMs);
    }
  };
  for (const name of ["pointermove", "pointerdown", "keydown", "scroll"]) {
    globalThis.addEventListener(name, wake, { passive: true, signal });
  }
  const follow = new MutationObserver(schedule);
  for (const selector of ["#how", "#showcase"]) {
    const target = document.querySelector(selector);
    if (target) {
      follow.observe(target, { attributes: true, attributeFilter: ["data-step", "data-state"] });
    }
  }
  globalThis.addEventListener("scroll", schedule, { passive: true, signal });
  globalThis.addEventListener("resize", schedule, { signal });

  button.addEventListener(
    "click",
    () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      setMenu(menu.hidden === true);
    },
    { signal },
  );

  items.forEach((item, index) => {
    item.addEventListener(
      "click",
      () => {
        answer = { text: item.dataset.answer ?? "", withDocs: index === items.length - 1 };
        clearTimeout(answerTimer);
        answerTimer = setTimeout(() => {
          answer = null;
          render();
        }, ANSWER_MS);
        setMenu(false);
        button.focus();
        render();
      },
      { signal },
    );
  });

  document.addEventListener(
    "keydown",
    (key) => {
      if (menu.hidden) return;
      if (key.key === "Escape") {
        setMenu(false);
        button.focus();
        return;
      }
      const focused = document.activeElement;
      const current = focused instanceof HTMLElement ? items.indexOf(focused) : -1;
      const target = menuTarget(current, key.key, items.length);
      if (target === null) return;
      key.preventDefault();
      items[target]?.focus();
    },
    { signal },
  );
  document.addEventListener(
    "pointerdown",
    (press) => {
      if (!menu.hidden && !(press.target instanceof Node && root.contains(press.target))) {
        setMenu(false);
      }
    },
    { signal },
  );
  root.addEventListener(
    "focusout",
    (change) => {
      const next = change.relatedTarget;
      if (!menu.hidden && next instanceof Node && !root.contains(next)) setMenu(false);
    },
    { signal },
  );

  if (!reduced) {
    wireEyes(root, button, signal);
    wireDrag(
      root,
      button,
      setMenu,
      () => {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, SUPPRESS_MS);
      },
      signal,
    );
  }

  root.hidden = false;
  measure();
  wake();
  return {
    destroy(): void {
      abort.abort();
      follow.disconnect();
      clearTimeout(idleTimer);
      clearTimeout(eventTimer);
      clearTimeout(answerTimer);
      if (frame !== 0) cancelAnimationFrame(frame);
    },
  };
}

/**
 * Shifts the eyes toward the pointer through two custom properties.
 * @param root - The companion element that carries the properties.
 * @param button - The golem button whose centre the eyes look from.
 * @param signal - Aborts the listener.
 */
function wireEyes(root: HTMLElement, button: HTMLElement, signal: AbortSignal): void {
  window.addEventListener(
    "pointermove",
    (move) => {
      const rect = button.getBoundingClientRect();
      const shift = eyeShift(
        { x: move.clientX, y: move.clientY },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        EYE_REACH,
      );
      root.style.setProperty("--eye-x", shift.x.toFixed(2));
      root.style.setProperty("--eye-y", shift.y.toFixed(2));
    },
    { passive: true, signal },
  );
}

/**
 * Lets the golem be dragged with pointer capture and sends it back on release.
 * @param root - The companion element that carries the offset properties.
 * @param button - The golem button that starts the drag.
 * @param setMenu - Opens or closes the menu.
 * @param swallowClick - Marks the click that ends a drag as not a toggle.
 * @param signal - Aborts the listeners.
 */
function wireDrag(
  root: HTMLElement,
  button: HTMLElement,
  setMenu: (open: boolean) => void,
  swallowClick: () => void,
  signal: AbortSignal,
): void {
  let start: { x: number; y: number; left: number; top: number } | null = null;
  let moved = false;

  button.addEventListener(
    "pointerdown",
    (press) => {
      if (start) return;
      const rect = root.getBoundingClientRect();
      start = { x: press.clientX, y: press.clientY, left: rect.left, top: rect.top };
      moved = false;
      delete root.dataset.back;
      button.setPointerCapture(press.pointerId);
    },
    { signal },
  );
  button.addEventListener(
    "pointermove",
    (move) => {
      if (!start) return;
      const raw = { x: move.clientX - start.x, y: move.clientY - start.y };
      if (!moved && Math.hypot(raw.x, raw.y) > DRAG_THRESHOLD) {
        moved = true;
        setMenu(false);
      }
      if (!moved) return;
      const offset = clampDrag(raw, { x: start.left - EDGE_GAP, y: start.top - EDGE_GAP });
      root.style.setProperty("--companion-dx", `${offset.x}px`);
      root.style.setProperty("--companion-dy", `${offset.y}px`);
    },
    { signal },
  );
  const end = (): void => {
    if (!start) return;
    start = null;
    if (!moved) return;
    swallowClick();
    root.dataset.back = "";
    root.style.setProperty("--companion-dx", "0px");
    root.style.setProperty("--companion-dy", "0px");
  };
  button.addEventListener("pointerup", end, { signal });
  button.addEventListener("pointercancel", end, { signal });
}
