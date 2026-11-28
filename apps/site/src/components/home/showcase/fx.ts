/**
 * Living painting effects of the showcase: clouds, river and eyes on the day
 * painting and on the dusk painting. The eyes look at the flag switch, or at the
 * pointer while it is over the frame, and blink and glow whenever the flag flips.
 * Each painting runs its own `paintingFx` and draws only while its state is the
 * active one; the dusk one is built the first time the flag is held, once its
 * image has loaded.
 */
import { paintingFx, VALLEY_PAINTING } from "../graphics/painting-fx";
import type { PaintingData, PaintingFxHandle, PaintingFxOptions } from "../graphics/painting-fx";

const WIDE_QUERY = "(min-width: 901px)";

/** The CSS image framing of `.showcase-stage img` at 901px and wider (`showcase.css`). */
export const WIDE_OBJECT_POSITION = [0.5, 0.5] as const;

/** The CSS image framing of `.showcase-stage img` below 901px (`showcase.css`). */
export const NARROW_OBJECT_POSITION = [0.94, 1] as const;

/** Where the painting sits in its box at the current width, matching the CSS image. */
export function showcaseObjectPosition(): readonly [number, number] {
  const wide =
    typeof globalThis.matchMedia === "function" && globalThis.matchMedia(WIDE_QUERY).matches;
  return wide ? WIDE_OBJECT_POSITION : NARROW_OBJECT_POSITION;
}

const EFFECTS = { clouds: true, water: true, eyes: true } as const;

const DAY_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1352.75, 671],
    [1387.25, 671.9],
  ],
};

const DUSK_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1354, 673.25],
    [1388.5, 673.5],
  ],
};

const FX_MARKERS = ["data-fx", "data-fx-clouds", "data-fx-water", "data-fx-eyes"];

/** The `paintingFx` entry point; tests pass a fake. */
type PaintingFxFactory = (host: HTMLElement, options: PaintingFxOptions) => PaintingFxHandle;

interface GazePoint {
  x: number;
  y: number;
}

function centreOf(rect: DOMRect): GazePoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The pointer in `host` coordinates while it is over `frame`, otherwise the centre of `target`. */
export function gazeFor(
  host: HTMLElement,
  frame: HTMLElement,
  target: HTMLElement,
  pointer: GazePoint | null,
): GazePoint {
  const hostRect = host.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const inside =
    pointer !== null &&
    pointer.x >= frameRect.left &&
    pointer.x <= frameRect.right &&
    pointer.y >= frameRect.top &&
    pointer.y <= frameRect.bottom;
  const point = inside ? pointer : centreOf(target.getBoundingClientRect());
  return { x: point.x - hostRect.left, y: point.y - hostRect.top };
}

/** Sets each marker on `stage` while any of `hosts` carries it, so the CSS Valley fallback steps aside. */
export function mirrorMarkers(stage: HTMLElement, hosts: readonly HTMLElement[]): void {
  for (const marker of FX_MARKERS) {
    const on = hosts.some((host) => host.hasAttribute(marker));
    if (on) stage.setAttribute(marker, marker === "data-fx" ? "on" : "");
    else stage.removeAttribute(marker);
  }
}

/** Starts the showcase effects; `onFlag` is told whenever the held state changes. */
export function initShowcaseFx(
  frame: HTMLElement,
  sw: HTMLElement,
  onFlag: (cb: (held: boolean) => void) => void,
  createFx: PaintingFxFactory = paintingFx,
): { destroy(): void } {
  const root = frame.closest<HTMLElement>("[data-showcase]");
  const dayHost = frame.querySelector<HTMLImageElement>("img.showcase-day")?.parentElement ?? null;
  const duskHost = frame.querySelector<HTMLElement>("[data-fx-dusk]");
  const duskImage = duskHost?.querySelector("img") ?? null;

  let held = root?.dataset.state === "held";
  const dayActive = (): boolean => !held;
  const duskActive = (): boolean => held;
  let pointer: GazePoint | null = null;
  let destroyed = false;
  let day: PaintingFxHandle | undefined;
  let dusk: PaintingFxHandle | undefined;
  let duskPending = false;

  const onPointerMove = (event: PointerEvent): void => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  addEventListener("pointermove", onPointerMove, { passive: true });

  const build = (
    host: HTMLElement,
    painting: PaintingData,
    active: () => boolean,
  ): PaintingFxHandle =>
    createFx(host, {
      painting,
      objectPosition: showcaseObjectPosition(),
      effects: EFFECTS,
      gaze: () => gazeFor(host, frame, sw, pointer),
      when: active,
    });

  const wideQuery =
    typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(WIDE_QUERY) : undefined;
  const onFramingChange = (): void => {
    if (destroyed) return;
    const hadDusk = dusk !== undefined;
    day?.destroy();
    dusk?.destroy();
    day = undefined;
    dusk = undefined;
    if (dayHost) day = build(dayHost, DAY_PAINTING, dayActive);
    if (hadDusk && duskHost) dusk = build(duskHost, DUSK_PAINTING, duskActive);
  };
  wideQuery?.addEventListener("change", onFramingChange);

  const buildDusk = (): void => {
    if (!duskHost || !duskImage || dusk || duskPending) return;
    const make = (): void => {
      duskPending = false;
      if (destroyed) return;
      dusk = build(duskHost, DUSK_PAINTING, duskActive);
    };
    if (duskImage.complete && duskImage.naturalWidth > 0) {
      make();
    } else {
      duskPending = true;
      duskImage.addEventListener("load", make, { once: true });
    }
  };

  const stage = frame.querySelector<HTMLElement>(".showcase-stage");
  const hosts = [dayHost, duskHost].filter((host): host is HTMLElement => host !== null);
  const markers = new MutationObserver(() => {
    if (stage) mirrorMarkers(stage, hosts);
  });
  for (const host of hosts)
    markers.observe(host, { attributes: true, attributeFilter: FX_MARKERS });

  if (dayHost) day = build(dayHost, DAY_PAINTING, dayActive);
  if (held) buildDusk();

  onFlag((nextHeld) => {
    held = nextHeld;
    if (held) buildDusk();
    const active = held ? dusk : day;
    active?.blink();
    active?.glow();
  });

  return {
    destroy() {
      destroyed = true;
      markers.disconnect();
      removeEventListener("pointermove", onPointerMove);
      wideQuery?.removeEventListener("change", onFramingChange);
      day?.destroy();
      dusk?.destroy();
      day = undefined;
      dusk = undefined;
    },
  };
}
