const TAG_OPEN_OUTSIDE_MARK = /<(?!\/?mark>)/gi;

/**
 * Reduces an HTML string to text plus bare `<mark>` and `</mark>` tags, the
 * only markup Pagefind's result excerpts and messages carry. Every other `<`
 * becomes `&lt;`, so the string cannot start an element, attribute or script
 * when it reaches `innerHTML`.
 * @param html - The string a page script assigns to an HTML sink.
 * @returns The same text with every tag but `<mark>` neutralized.
 */
export function restrictToMarkTags(html: string): string {
  return html.replaceAll(TAG_OPEN_OUTSIDE_MARK, "&lt;");
}

/**
 * What the search dialog shows below the query row.
 */
export type SearchState = "idle" | "searching" | "empty" | "results";

/**
 * Whether a message is a template with its placeholder filled.
 * @param message - The text of Pagefind's message line.
 * @param template - A string with one placeholder, such as `Nothing matches “[SEARCH_TERM]”.`
 * @param token - The placeholder text.
 * @returns True when the message starts and ends like the template.
 */
export function matchesTemplate(message: string, template: string, token: string): boolean {
  const at = template.indexOf(token);
  if (at === -1) return message === template;
  const prefix = template.slice(0, at);
  const suffix = template.slice(at + token.length);
  return (
    message.length >= prefix.length + suffix.length &&
    message.startsWith(prefix) &&
    message.endsWith(suffix)
  );
}

/**
 * Decides which state the search dialog is in from Pagefind's rendered output.
 * @param output - The message line text and whether any result is listed.
 * @param templates - The localized searching and no-results messages.
 * @returns The dialog state that drives its spinner, mascot and result list.
 */
export function classifySearchState(
  output: { message: string; hasResults: boolean },
  templates: { searching: string; noResults: string; token: string },
): SearchState {
  const message = output.message.trim();
  if (message === "" && !output.hasResults) return "idle";
  if (matchesTemplate(message, templates.searching, templates.token)) return "searching";
  if (matchesTemplate(message, templates.noResults, templates.token)) return "empty";
  return output.hasResults ? "results" : "idle";
}

/**
 * Moves the keyboard position through the query field and the result links.
 * @param current - The focused position, 0 for the query field, or -1 for none.
 * @param count - How many positions exist, the field included.
 * @param delta - 1 for the next position, -1 for the previous one.
 * @returns The new position, clamped to the list.
 */
export function moveSearchFocus(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/**
 * The event the page script sends the search dialog to open or toggle it.
 */
export const SEARCH_REQUEST_EVENT = "docs-search:request";

/**
 * The attribute the page script sets on the search root while the dialog has
 * not hydrated yet, so the first request is not lost.
 */
export const SEARCH_PENDING_ATTRIBUTE = "data-search-requested";

/**
 * How a request changes the dialog: `open` only opens it, `toggle` flips it.
 */
export type SearchRequestMode = "open" | "toggle";

/**
 * Applies a request to the dialog's open state.
 * @param isOpen - Whether the dialog is open now.
 * @param mode - What the request asks for.
 * @returns The open state after the request.
 */
export function applySearchRequest(isOpen: boolean, mode: SearchRequestMode): boolean {
  return mode === "toggle" ? !isOpen : true;
}
