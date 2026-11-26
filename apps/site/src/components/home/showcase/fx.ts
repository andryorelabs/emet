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

const SHOWCASE_OBJECT_POSITION = [0.5, 1] as const;
const EFFECTS = { clouds: true, water: true, eyes: true } as const;

const DAY_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1352.75, 671],
    [1387.25, 671.9],
  ],
  objectPosition: SHOWCASE_OBJECT_POSITION,
};

const DUSK_PAINTING: PaintingData = {
  ...VALLEY_PAINTING,
  eyes: [
    [1354, 673.25],
    [1388.5, 673.5],
  ],
  objectPosition: SHOWCASE_OBJECT_POSITION,
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
      effects: EFFECTS,
      gaze: () => gazeFor(host, frame, sw, pointer),
      when: active,
    });

  const buildDusk = (): void => {
    if (!duskHost || !duskImage || dusk || duskPending) return;
    const make = (): void => {
      duskPending = false;
      if (destroyed) return;
      dusk = build(duskHost, DUSK_PAINTING, () => held);
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

  if (dayHost) day = build(dayHost, DAY_PAINTING, () => !held);
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
      day?.destroy();
      dusk?.destroy();
      day = undefined;
      dusk = undefined;
    },
  };
}
