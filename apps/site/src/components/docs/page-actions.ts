/**
 * The slice of a keyboard event the arrow-key shortcut reads.
 */
export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The slice of an event target the arrow-key shortcut reads.
 */
export interface EventTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * Where "Open in" sends the visitor.
 */
export type OpenInTarget = "chatgpt" | "claude";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable], [role=tab], [role=tablist], [role=menu], [role=menuitem], dialog, pre";

/**
 * The prompt Open in ChatGPT and Open in Claude carry. Always English.
 * @param pageUrl - Absolute URL of the docs page.
 * @returns The prompt text.
 */
export function buildOpenInPrompt(pageUrl: string): string {
  return `I'm looking at this emet documentation: ${pageUrl}. Help me understand how to use it. Be ready to explain concepts, give examples, or help debug based on it.`;
}

/**
 * The URL that opens an assistant with the docs prompt prefilled.
 * @param target - The assistant.
 * @param pageUrl - Absolute URL of the docs page.
 * @returns The assistant URL with the encoded prompt as `q`.
 */
export function buildOpenInUrl(target: OpenInTarget, pageUrl: string): string {
  const base = target === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
  return `${base}?q=${encodeURIComponent(buildOpenInPrompt(pageUrl))}`;
}

/**
 * Whether an event target is a text field, select or contenteditable region.
 * @param target - The event target.
 * @returns True when typing there must keep the arrow keys.
 */
function isEditableTarget(target: EventTargetLike): boolean {
  if (target.isContentEditable === true) {
    return true;
  }
  if (target.tagName !== undefined && EDITABLE_TAGS.has(target.tagName.toUpperCase())) {
    return true;
  }
  return target.closest?.(EDITABLE_SELECTOR) != null;
}

/**
 * Whether an arrow key should move between docs pages.
 * @param event - The keydown event.
 * @param target - The event's target.
 * @returns True for a bare ← or → outside editable elements.
 */
export function shouldHandleArrowKey(event: KeyboardEventLike, target: EventTargetLike): boolean {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return false;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  return !isEditableTarget(target);
}
