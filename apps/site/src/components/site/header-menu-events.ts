/**
 * Name of the document event that announces a header menu opening, so the
 * other header menus can close and only one stays open at a time.
 */
export const HEADER_MENU_OPEN_EVENT = "emet:header-menu-open";

/**
 * Tells the other header menus that the menu with this id is opening.
 * @param id - The id of the menu that opens.
 * @param source - The trigger element of the menu that opens.
 */
export function announceHeaderMenuOpen(id: string, source: Element): void {
  document.dispatchEvent(new CustomEvent(HEADER_MENU_OPEN_EVENT, { detail: { id, source } }));
}

/**
 * Runs `close` whenever a menu other than this one announces it is opening.
 * @param id - The id of the listening menu, which never closes itself.
 * @param close - Closes the listening menu, given the trigger of the menu that opened.
 * @returns Removes the listener.
 */
export function onOtherHeaderMenuOpen(id: string, close: (source: Element) => void): () => void {
  const listener = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (typeof detail !== "object" || detail === null) return;
    if (!("id" in detail) || !("source" in detail)) return;
    if (detail.id === id || !(detail.source instanceof Element)) return;
    close(detail.source);
  };
  document.addEventListener(HEADER_MENU_OPEN_EVENT, listener);
  return () => {
    document.removeEventListener(HEADER_MENU_OPEN_EVENT, listener);
  };
}
