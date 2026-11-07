/**
 * Bundled module of the showcase: wires the flag switch to the state, swaps
 * heading and status text, cross-fades the paintings through a root attribute
 * and loads the dusk painting on first interaction or when the browser idles.
 */
import { initialState, toggle, viewFor, type ShowcaseState } from "./state";

function loadDusk(root: HTMLElement): void {
  const dusk = root.querySelector<HTMLImageElement>("img[data-srcset]");
  if (!dusk || dusk.srcset) return;
  dusk.sizes = dusk.dataset.sizes ?? "100vw";
  dusk.srcset = dusk.dataset.srcset ?? "";
}

function schedulePreload(root: HTMLElement): void {
  const load = (): void => loadDusk(root);
  root.addEventListener("pointerenter", load, { once: true });
  root.addEventListener("focusin", load, { once: true });
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load);
  } else {
    globalThis.setTimeout(load, 2000);
  }
}

function parseCopy(raw: string | undefined): Record<string, string> {
  const parsed: unknown = JSON.parse(raw ?? "{}");
  const copy: Record<string, string> = {};
  if (typeof parsed === "object" && parsed !== null) {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") copy[key] = value;
    }
  }
  return copy;
}

function mount(root: HTMLElement): void {
  const control = root.querySelector<HTMLButtonElement>("[data-showcase-flag]");
  const heading = root.querySelector<HTMLElement>("[data-showcase-heading]");
  const status = root.querySelector<HTMLElement>("[data-showcase-status]");
  if (!control || !heading || !status) return;

  const copy = parseCopy(root.dataset.copy);
  let state: ShowcaseState = initialState;

  const render = (): void => {
    const view = viewFor(state);
    heading.textContent = copy[view.headingKey] ?? "";
    status.textContent = copy[view.statusKey] ?? "";
    control.setAttribute("aria-pressed", view.pressed);
    root.dataset.state = view.held ? "held" : "merged";
  };

  control.hidden = false;
  root.dataset.enhanced = "";
  control.addEventListener("click", () => {
    loadDusk(root);
    state = toggle(state);
    render();
  });
  schedulePreload(root);
}

const root = document.querySelector<HTMLElement>("[data-showcase]");
if (root) mount(root);
