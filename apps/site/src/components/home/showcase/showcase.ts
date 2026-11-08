/**
 * Bundled module of the showcase: wires the flag switch to the state, toggles
 * the visible variants through a root attribute, mirrors the active status into
 * a live region, cross-fades the paintings and loads the dusk painting on first
 * interaction or when the browser idles. When scroll-driven animation is
 * supported and motion is allowed it pins the section and flips the state with
 * scroll progress, a click holding until the next threshold crossing.
 */
import {
  clickStep,
  initialState,
  initialTrack,
  runwayProgress,
  scrollStep,
  viewFor,
  type ScrollTrack,
  type ShowcaseState,
} from "./state";

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

function createLiveRegion(status: HTMLElement): HTMLElement {
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.textContent = activeText(status, false);
  status.setAttribute("aria-hidden", "true");
  status.after(live);
  return live;
}

function activeText(status: HTMLElement, held: boolean): string {
  const variant = held ? "held" : "merged";
  return status.querySelector(`[data-variant="${variant}"]`)?.textContent?.trim() ?? "";
}

function mount(root: HTMLElement): void {
  const control = root.querySelector<HTMLButtonElement>("[data-showcase-flag]");
  const status = root.querySelector<HTMLElement>("[data-showcase-status]");
  if (!control || !status) return;

  const live = createLiveRegion(status);
  const supportsPin = CSS.supports("animation-timeline: view()");
  const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  let state: ShowcaseState = initialState;
  let track: ScrollTrack = initialTrack;
  let intersecting = false;
  let frame = 0;

  const render = (): void => {
    const view = viewFor(state);
    live.textContent = activeText(status, view.held);
    control.setAttribute("aria-pressed", view.pressed);
    root.dataset.state = view.held ? "held" : "merged";
  };

  const syncFromScroll = (): void => {
    frame = 0;
    if (!("pinned" in root.dataset) || !intersecting) return;
    const progress = runwayProgress(root.getBoundingClientRect(), globalThis.innerHeight);
    const next = scrollStep(progress, state, track);
    track = next.track;
    if (next.state.held === state.held) return;
    state = next.state;
    render();
  };

  const onScroll = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(syncFromScroll);
  };

  const applyPin = (): void => {
    if (supportsPin && !reducedMotion.matches) {
      root.dataset.pinned = "";
      onScroll();
    } else {
      delete root.dataset.pinned;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    intersecting = entries.some((entry) => entry.isIntersecting);
    if (intersecting) onScroll();
  });
  observer.observe(root);
  globalThis.addEventListener("scroll", onScroll, { passive: true });
  reducedMotion.addEventListener("change", applyPin);

  control.hidden = false;
  root.dataset.enhanced = "";
  control.addEventListener("click", () => {
    loadDusk(root);
    const next = clickStep(state, track);
    state = next.state;
    track = next.track;
    render();
  });
  applyPin();
  schedulePreload(root);
}

const root = document.querySelector<HTMLElement>("[data-showcase]");
if (root) mount(root);
