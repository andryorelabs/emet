/**
 * Events that start hydration of an island: the pointer entering it, focus
 * moving into it, or a touch landing on it.
 */
export const INTERACTION_EVENTS = ["pointerenter", "focusin", "touchstart"] as const;

const CAPTURE = { capture: true };

/**
 * Time given to React's concurrent hydration to attach its handlers after the
 * island reports it has hydrated, before early clicks are replayed.
 */
const HYDRATION_SETTLE_MS = 50;

/**
 * Whether the target is a node that has left the document.
 * @param target - The target of a recorded click.
 * @returns `true` only when the target reports it is no longer connected.
 */
function isDetached(target: EventTarget): boolean {
  return "isConnected" in target && target.isConnected === false;
}

/**
 * Whether the node can be clicked programmatically.
 * @param node - A node of the recorded click's ancestry.
 * @returns A type guard for nodes with a `click` method.
 */
function isClickable(node: object): node is { click: () => void } {
  return "click" in node && typeof node.click === "function";
}

/**
 * The nearest node from the target upwards that can be clicked
 * programmatically; an SVG icon has no `click` method, but its button does.
 * @param target - The target of a recorded click.
 * @returns The target itself or its closest clickable ancestor, if any.
 */
function clickableFrom(target: EventTarget): { click: () => void } | undefined {
  let node: object | undefined = target;
  while (node) {
    if (isClickable(node)) return node;
    const parent: unknown = "parentElement" in node ? node.parentElement : undefined;
    node = typeof parent === "object" && parent !== null ? parent : undefined;
  }
  return undefined;
}

/**
 * Hydrate an island on its first interaction. A click that lands while the
 * island's code is still loading would hit inert server HTML, so those clicks
 * are recorded, their native action is suppressed, and they are replayed once
 * hydration finishes so a native control such as `<summary>` acts only once.
 * @param root - The island element.
 * @param load - Resolves to the island's hydrate function once its code has
 * loaded, as Astro's client directive `load` does.
 */
export function hydrateOnInteraction(
  root: EventTarget,
  load: () => Promise<() => Promise<void>>,
): void {
  const earlyClickTargets: EventTarget[] = [];
  const recordClick = (event: Event) => {
    if (!event.target) return;
    event.preventDefault();
    earlyClickTargets.push(event.target);
  };

  const replayEarlyClicks = () => {
    for (const target of earlyClickTargets) {
      if (isDetached(target)) continue;
      clickableFrom(target)?.click();
    }
  };

  const hydrateAndReplay = async () => {
    try {
      const hydrate = await load();
      root.removeEventListener("click", recordClick, CAPTURE);
      await hydrate();
    } catch (error) {
      root.removeEventListener("click", recordClick, CAPTURE);
      replayEarlyClicks();
      throw error;
    }
    if (earlyClickTargets.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, HYDRATION_SETTLE_MS));
    }
    replayEarlyClicks();
  };

  const start = () => {
    for (const type of INTERACTION_EVENTS) {
      root.removeEventListener(type, start, CAPTURE);
    }
    hydrateAndReplay().catch((error: unknown) => {
      console.error("Island hydration failed", error);
    });
  };

  for (const type of INTERACTION_EVENTS) {
    root.addEventListener(type, start, CAPTURE);
  }
  root.addEventListener("click", recordClick, CAPTURE);
}
