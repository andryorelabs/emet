/**
 * Bundled module of the showcase: wires the flag switch to the state, toggles
 * the visible variants through a root attribute, mirrors the active status into
 * a live region, cross-fades the paintings and loads the dusk painting on first
 * interaction or when the browser idles. When scroll-driven animation is
 * supported, motion is allowed and the viewport is at least 901px wide it pins
 * the runway, grows the frame, fades in the glass panel and flips the state with
 * scroll progress, a click holding until the next threshold crossing. The git
 * lanes canvas animates while on screen and draws one frame under reduced motion.
 */
import { frameInset, panelOpacity } from "./grow";
import { initLanes, LANES_REFRESH_EVENT } from "./lanes";
import {
  clickStep,
  initialState,
  initialTrack,
  releaseOverride,
  runwayProgress,
  scrollStep,
  viewFor,
  type ScrollTrack,
  type ShowcaseState,
} from "./state";

const WIDE_QUERY = "(min-width: 901px)";
const GROW_PROPERTIES = [
  "--showcase-x",
  "--showcase-y",
  "--showcase-r",
  "--showcase-marks",
  "--showcase-panel",
];

function writeGrow(root: HTMLElement, progress: number): void {
  const panel = root.querySelector<HTMLElement>(".showcase-panel");
  if (panel) {
    const inert = panelOpacity(progress) === 0;
    if (panel.inert !== inert) {
      panel.inert = inert;
      panel.querySelector("canvas")?.dispatchEvent(new Event(LANES_REFRESH_EVENT));
    }
  }
  const inset = frameInset(progress);
  root.style.setProperty("--showcase-x", String(inset.x));
  root.style.setProperty("--showcase-y", String(inset.y));
  root.style.setProperty("--showcase-r", String(inset.radius));
  root.style.setProperty("--showcase-marks", String(inset.marks));
  root.style.setProperty("--showcase-panel", String(panelOpacity(progress)));
}

function clearGrow(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>(".showcase-panel");
  if (panel?.inert) {
    panel.inert = false;
    panel.querySelector("canvas")?.dispatchEvent(new Event(LANES_REFRESH_EVENT));
  }
  for (const property of GROW_PROPERTIES) root.style.removeProperty(property);
}

function loadDusk(root: HTMLElement): void {
  const dusk = root.querySelector<HTMLImageElement>("img[data-srcset]");
  if (!dusk || dusk.srcset) return;
  dusk.sizes = dusk.dataset.sizes ?? "100vw";
  dusk.srcset = dusk.dataset.srcset ?? "";
}

function schedulePreload(root: HTMLElement): void {
  const load = (): void => {
    loadDusk(root);
  };
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
  status.closest("[data-showcase]")?.append(live);
  return live;
}

function activeText(status: HTMLElement, held: boolean): string {
  const variant = held ? "held" : "merged";
  return status.querySelector(`[data-variant="${variant}"]`)?.textContent.trim() ?? "";
}

function mount(root: HTMLElement): void {
  const control = root.querySelector<HTMLButtonElement>("[data-showcase-flag]");
  const status = root.querySelector<HTMLElement>("[data-showcase-status]");
  if (!control || !status) return;

  const live = createLiveRegion(status);
  const supportsPin = CSS.supports("animation-timeline: view()");
  const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  const wide = globalThis.matchMedia(WIDE_QUERY);
  const canvas = root.querySelector<HTMLCanvasElement>("canvas[data-showcase-lanes]");
  const panel = root.querySelector<HTMLElement>(".showcase-panel");
  let lanes: { destroy(): void } | undefined;
  let state: ShowcaseState = initialState;
  let track: ScrollTrack = initialTrack;
  let intersecting = false;
  let frame = 0;

  const render = (): void => {
    const view = viewFor(state);
    live.textContent = activeText(status, view.held);
    control.setAttribute("aria-pressed", view.pressed);
    root.dataset.state = view.held ? "held" : "merged";
    canvas?.dispatchEvent(new Event(LANES_REFRESH_EVENT));
  };

  const syncFromScroll = (): void => {
    frame = 0;
    if (!("pinned" in root.dataset) || !intersecting) return;
    const progress = runwayProgress(root.getBoundingClientRect(), globalThis.innerHeight);
    writeGrow(root, progress);
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
    if (supportsPin && wide.matches && !reducedMotion.matches) {
      root.dataset.pinned = "";
      onScroll();
    } else {
      delete root.dataset.pinned;
      clearGrow(root);
    }
  };

  const applyLanes = (): void => {
    lanes?.destroy();
    lanes = canvas
      ? initLanes(canvas, {
          reduce: reducedMotion.matches,
          isHeld: () => state.held,
          isActive: () => !panel?.inert,
        })
      : undefined;
  };

  const observer = new IntersectionObserver((entries) => {
    intersecting = entries.some((entry) => entry.isIntersecting);
    if (!intersecting) track = releaseOverride(track);
    if (intersecting) onScroll();
  });
  observer.observe(root);
  globalThis.addEventListener("scroll", onScroll, { passive: true });
  reducedMotion.addEventListener("change", applyPin);
  reducedMotion.addEventListener("change", applyLanes);
  wide.addEventListener("change", applyPin);

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
  applyLanes();
  schedulePreload(root);
}

const root = document.querySelector<HTMLElement>("[data-showcase]");
if (root) mount(root);
