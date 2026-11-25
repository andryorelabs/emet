/**
 * Storage key and change event of the theme choice, free of Node imports so the
 * theme menu island can ship them to the browser; `theme.ts` builds the inline
 * init script from the same constants.
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
 * Stores a choice and tells the init script, which applies it.
 * @param choice - The chosen theme.
 */
export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    void 0;
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: choice }));
}
