/**
 * Registry of the bento interactions: a scene module registers an init under
 * a name, and any element marked `data-interact="<name>"` under the root is
 * wired once. Unknown names and already wired elements are skipped.
 */

type SceneInit = (root: HTMLElement) => void;

const inits = new Map<string, SceneInit>();
const wired = new WeakSet<HTMLElement>();

/**
 * Registers the init of one interactive scene under `name`.
 */
export function registerScene(name: string, init: (root: HTMLElement) => void): void {
  inits.set(name, init);
}

/**
 * Wires every `[data-interact]` element under `root` that has a registered
 * init, at most once per element.
 */
export function initBentoInteractions(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-interact]")) {
    const init = inits.get(element.dataset.interact ?? "");
    if (init === undefined || wired.has(element)) continue;
    wired.add(element);
    init(element);
  }
}
