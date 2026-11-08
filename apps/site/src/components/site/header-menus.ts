/**
 * Client side of the header's language menu: keeps it to one open header menu
 * at a time, with the theme menu and the mobile panel, and gives the native
 * `details` the outside-click and Escape closing the theme menu already has.
 * Progressive enhancement: without script the `details` still works.
 */
import { HEADER_MENU_OPEN_EVENT } from "./theme-menu";

const wired = new WeakSet<HTMLDetailsElement>();

/**
 * Wires one language `details`.
 * @param details - The `details.lang` element.
 */
function initHeaderMenu(details: HTMLDetailsElement): void {
  if (wired.has(details)) return;
  wired.add(details);
  const doc = details.ownerDocument;
  const summary = details.querySelector<HTMLElement>("summary");

  details.addEventListener("toggle", () => {
    if (details.open) {
      doc.dispatchEvent(new CustomEvent(HEADER_MENU_OPEN_EVENT, { detail: details }));
    }
  });
  doc.addEventListener(HEADER_MENU_OPEN_EVENT, (event) => {
    if (event instanceof CustomEvent && event.detail !== details) details.open = false;
  });
  doc.addEventListener("click", (event) => {
    if (details.open && !(event.target instanceof Node && details.contains(event.target))) {
      details.open = false;
    }
  });
  details.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !details.open) return;
    event.preventDefault();
    details.open = false;
    summary?.focus();
  });
}

/**
 * Wires every language menu in the scope; safe to call more than once.
 * @param scope - The document or element to search.
 */
export function initHeaderMenus(scope: ParentNode = document): void {
  for (const details of scope.querySelectorAll<HTMLDetailsElement>("details.lang")) {
    initHeaderMenu(details);
  }
}
