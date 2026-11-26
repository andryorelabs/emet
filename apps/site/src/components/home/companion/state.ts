/**
 * Pure logic of the companion golem: which of its four states shows for the
 * section in view and the visitor's last action, where its eyes look, how far
 * a drag may travel and which menu item a key reaches.
 */

/** The four states the golem shows. */
export type CompanionState = "sleep" | "work" | "wait" | "done";

/** A visitor action other sections report through a `CustomEvent`. */
export type CompanionEvent =
  | { readonly kind: "approval-hold" }
  | { readonly kind: "flag-toggle"; readonly held: boolean }
  | { readonly kind: "copy" };

/** Names of the `CustomEvent`s on `window` the companion listens to. */
export const COMPANION_EVENT_NAMES = {
  approvalHold: "emet:approval-hold",
  flagToggle: "emet:flag-toggle",
  copy: "emet:copy",
} as const;

/** One view region of the page and the selector that finds it. */
export interface CompanionSection {
  readonly id: string;
  readonly selector: string;
}

/** The sections the golem reacts to, in page order. */
export const COMPANION_SECTIONS: readonly CompanionSection[] = [
  { id: "hero", selector: ".hero" },
  { id: "how", selector: "#how" },
  { id: "showcase", selector: "#showcase" },
  { id: "faq", selector: "[data-faq]" },
  { id: "closing", selector: ".closing" },
];

const SECTION_STATES: Readonly<Record<string, CompanionState>> = {
  hero: "sleep",
  how: "work",
  showcase: "work",
  faq: "done",
  closing: "done",
};

/**
 * The golem's state for a section and an optional visitor action. An action
 * wins over the section, except over the hero where the golem sleeps.
 * @param sectionId - The section in view, such as `hero` or `closing`.
 * @param event - The last visitor action, or `null` when there is none.
 * @returns The state to show.
 */
export function companionState(sectionId: string, event: CompanionEvent | null): CompanionState {
  if (sectionId === "hero") return "sleep";
  if (event?.kind === "approval-hold" || event?.kind === "copy") return "done";
  if (event?.kind === "flag-toggle") return event.held ? "wait" : "work";
  return SECTION_STATES[sectionId] ?? "work";
}

/**
 * The id of the section crossing a horizontal line.
 * @param rects - Each section id with its bounding rectangle.
 * @param line - The y coordinate to test, usually the viewport middle.
 * @returns The id under the line, or `""` when none is.
 */
export function sectionAtLine(
  rects: readonly { readonly id: string; readonly top: number; readonly bottom: number }[],
  line: number,
): string {
  return rects.find((rect) => rect.top < line && rect.bottom > line)?.id ?? "";
}

/**
 * How far the eyes shift toward a pointer, as a fraction of their reach.
 * @param pointer - The pointer position.
 * @param center - The centre of the golem.
 * @param reach - The distance at which the eyes are fully shifted.
 * @returns A shift on each axis between -1 and 1.
 */
export function eyeShift(
  pointer: { readonly x: number; readonly y: number },
  center: { readonly x: number; readonly y: number },
  reach: number,
): { x: number; y: number } {
  const clamp = (value: number): number => Math.max(-1, Math.min(1, value / reach));
  return { x: clamp(pointer.x - center.x), y: clamp(pointer.y - center.y) };
}

/**
 * Limits a drag offset so the golem stays inside the viewport, which only
 * leaves the up and left directions free from its bottom-right anchor.
 * @param offset - The raw pointer travel.
 * @param room - The free space up and to the left of the golem.
 * @returns The offset to apply.
 */
export function clampDrag(
  offset: { readonly x: number; readonly y: number },
  room: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(offset.x, -room.x), 0),
    y: Math.min(Math.max(offset.y, -room.y), 0),
  };
}

/**
 * The menu item a key reaches.
 * @param current - The focused item index, or `-1` when none is.
 * @param key - The pressed key.
 * @param count - The number of items.
 * @returns The index to focus, or `null` when the key does not move focus.
 */
export function menuTarget(current: number, key: string, count: number): number | null {
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
