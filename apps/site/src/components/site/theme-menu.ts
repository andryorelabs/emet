/**
 * Client side of the theme selector: the stored choice, the menu keyboard
 * model and the DOM wiring. Kept free of Node imports so it can ship to the
 * browser; `theme.ts` builds the inline init script from the same constants.
 */

export const THEME_STORAGE_KEY = "emet:theme";
export const THEME_CHANGE_EVENT = "emet:theme";
const THEME_CHOICES = ["light", "dark", "system"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * Narrows an unknown value to a theme choice.
 * @param value - A stored or dispatched value.
 * @returns The choice, or `undefined` when the value is not one.
 */
export function parseThemeChoice(value: unknown): ThemeChoice | undefined {
  return THEME_CHOICES.find((choice) => choice === value);
}

/**
 * Reads the stored choice.
 * @param storage - The storage to read, `localStorage` by default.
 * @returns The stored choice, `system` when missing, invalid or unreadable.
 */
export function readStoredTheme(storage?: Pick<Storage, "getItem">): ThemeChoice {
  try {
    return parseThemeChoice((storage ?? localStorage).getItem(THEME_STORAGE_KEY)) ?? "system";
  } catch {
    return "system";
  }
}

/**
 * The menu row a key press moves to.
 * @param key - The `KeyboardEvent.key` value.
 * @param current - The focused row index, `-1` when none.
 * @param count - The number of rows.
 * @returns The next row index, or `undefined` when the key does not move.
 */
export function menuIndexAfterKey(key: string, current: number, count: number): number | undefined {
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

const OPEN_KEYS = new Set(["ArrowDown", "ArrowUp"]);

function persist(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    return;
  }
}

/**
 * Wires one theme selector: the button, the radio menu and its keyboard.
 * Choosing stores the value and tells the init script through
 * `THEME_CHANGE_EVENT`, which applies it.
 * @param root - The `[data-theme-select]` element.
 */
function initThemeSelect(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>(".theme-button");
  const menu = root.querySelector<HTMLElement>(".theme-menu");
  if (button === null || menu === null) return;
  const rows = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
  const view = root.ownerDocument.defaultView;

  const syncChecked = (): void => {
    const current = readStoredTheme();
    for (const row of rows) {
      row.setAttribute("aria-checked", String(row.dataset["choice"] === current));
    }
  };
  const isOpen = (): boolean => !menu.hidden;
  const close = (restoreFocus: boolean): void => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  };
  const open = (): void => {
    syncChecked();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const checked = rows.find((row) => row.getAttribute("aria-checked") === "true");
    (checked ?? rows[0])?.focus();
  };
  const choose = (choice: ThemeChoice): void => {
    persist(choice);
    view?.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: choice }));
    syncChecked();
    close(true);
  };

  button.addEventListener("click", () => (isOpen() ? close(true) : open()));
  button.addEventListener("keydown", (event) => {
    if (!OPEN_KEYS.has(event.key)) return;
    event.preventDefault();
    open();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(true);
      return;
    }
    const current = rows.findIndex((row) => row === root.ownerDocument.activeElement);
    const next = menuIndexAfterKey(event.key, current, rows.length);
    if (next === undefined) return;
    event.preventDefault();
    rows[next]?.focus();
  });
  for (const row of rows) {
    row.addEventListener("click", () => {
      const choice = parseThemeChoice(row.dataset["choice"]);
      if (choice !== undefined) choose(choice);
    });
  }
  root.ownerDocument.addEventListener("click", (event) => {
    const inside = event.target instanceof Node && root.contains(event.target);
    if (isOpen() && !inside) close(false);
  });

  syncChecked();
  root.hidden = false;
}

/**
 * Wires every theme selector on the page.
 * @param scope - The document or element to search.
 */
export function initThemeSelects(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>("[data-theme-select]")) {
    initThemeSelect(root);
  }
}
