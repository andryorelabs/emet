/**
 * Name of the document event that announces a header menu opening, so the
 * other header menus can close and only one stays open at a time.
 */
export const HEADER_MENU_OPEN_EVENT = "emet:header-menu-open";

/**
 * Tells the other header menus that the menu with this id is opening.
 * @param id - The id of the menu that opens.
 */
export function announceHeaderMenuOpen(id: string): void {
  document.dispatchEvent(new CustomEvent(HEADER_MENU_OPEN_EVENT, { detail: id }));
}

/**
 * Runs `close` whenever a menu other than this one announces it is opening.
 * @param id - The id of the listening menu, which never closes itself.
 * @param close - Closes the listening menu.
 * @returns Removes the listener.
 */
export function onOtherHeaderMenuOpen(id: string, close: () => void): () => void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail !== id) close();
  };
  document.addEventListener(HEADER_MENU_OPEN_EVENT, listener);
  return () => {
    document.removeEventListener(HEADER_MENU_OPEN_EVENT, listener);
  };
}
