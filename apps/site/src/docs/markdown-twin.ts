import type { LocalizedPage } from "./catalog";
import { buildSidebar, type SidebarEntry } from "./sidebar";

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
 * Page ids in the order the sidebar shows them.
 * @param entries - Sidebar entries, groups included.
 * @returns The slugs flattened in display order.
 */
export function sidebarSlugOrder(entries: readonly SidebarEntry[] = buildSidebar()): string[] {
  return entries.flatMap((entry) =>
    "slug" in entry ? [entry.slug] : sidebarSlugOrder(entry.items),
  );
}

/**
 * Concatenates the English pages' twins for `llms-full.txt`, in sidebar order.
 * Pages the sidebar does not list come last, in catalog order.
 * @param pages - Catalog pages in any order.
 * @returns Every English twin, separated by a blank line.
 */
export function buildLlmsFullTxt(pages: readonly LocalizedPage[]): string {
  const order = sidebarSlugOrder();
  const rank = (page: LocalizedPage): number => {
    const index = order.indexOf(page.id);
    return index === -1 ? order.length : index;
  };
  return pages
    .filter((page) => page.locale === "en")
    .toSorted((a, b) => rank(a) - rank(b))
    .map((page) => renderMarkdownTwin(page))
    .join("\n");
}
