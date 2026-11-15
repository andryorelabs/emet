import type { LocalizedPage } from "./catalog";

/**
 * Route of a page's Markdown twin.
 * @param pageId - Starlight entry id, e.g. `es/docs/guide/fleet`.
 * @returns The absolute path, e.g. `/es/docs/guide/fleet.md`.
 */
export function markdownTwinPath(pageId: string): string {
  return `/${pageId}.md`;
}

/**
 * Renders a page as Markdown: its H1 followed by its body. The body is the
 * translation when current, English otherwise, as on the HTML page.
 * @param page - A localized page.
 * @returns The Markdown document.
 */
export function renderMarkdownTwin(page: LocalizedPage): string {
  const body = page.body.endsWith("\n") ? page.body : `${page.body}\n`;
  return `# ${page.title}\n\n${body}`;
}

/**
 * Concatenates the English pages' twins for `llms-full.txt`.
 * @param pages - Catalog pages in sidebar order.
 * @returns Every English twin, separated by a blank line.
 */
export function buildLlmsFullTxt(pages: readonly LocalizedPage[]): string {
  return pages
    .filter((page) => page.locale === "en")
    .map((page) => renderMarkdownTwin(page))
    .join("\n");
}
