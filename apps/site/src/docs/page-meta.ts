/**
 * The part of a Starlight head entry the SEO title swap reads and writes.
 */
export interface HeadEntry {
  tag: string;
  attrs?: Record<string, string | boolean | undefined> | undefined;
  content?: string | undefined;
}

function swapTitle<Entry extends HeadEntry>(entry: Entry, title: string, seoTitle: string): Entry {
  if (entry.tag === "title" && entry.content?.startsWith(title)) {
    return { ...entry, content: seoTitle + entry.content.slice(title.length) };
  }
  const isOpenGraphTitle = entry.tag === "meta" && entry.attrs?.["property"] === "og:title";
  return isOpenGraphTitle ? { ...entry, attrs: { ...entry.attrs, content: seoTitle } } : entry;
}

/**
 * Replaces the page title with its SEO title in `<title>` and `og:title`.
 * Starlight builds `<title>` as "page title | site title"; the site suffix is
 * kept. The visible H1 and the sidebar keep the page title.
 * @param head - The route's head entries.
 * @param title - The page title Starlight used to build them.
 * @param seoTitle - The SEO title, or `undefined` to leave the head as is.
 * @returns A new head array with the SEO title applied.
 */
export function applySeoTitle<Entry extends HeadEntry>(
  head: readonly Entry[],
  title: string,
  seoTitle: string | undefined,
): Entry[] {
  return seoTitle ? head.map((entry) => swapTitle(entry, title, seoTitle)) : [...head];
}

function tagKey(entry: HeadEntry): string | undefined {
  const attrs = entry.attrs ?? {};
  if (entry.tag === "meta") {
    const name = attrs["property"] ?? attrs["name"];
    return typeof name === "string" ? `meta:${name}` : undefined;
  }
  if (entry.tag === "link" && typeof attrs["rel"] === "string") {
    return `link:${attrs["rel"]}:${attrs["href"] ?? ""}`;
  }
  return undefined;
}

/**
 * Appends the extra tags the head does not already carry. A meta tag counts as
 * present by its `property` or `name`, a link by its `rel` and `href`.
 * @param head - The route's head entries.
 * @param extra - Tags to add where missing.
 * @returns A new head array.
 */
export function mergeMissingTags<Entry extends HeadEntry>(
  head: readonly Entry[],
  extra: readonly Entry[],
): Entry[] {
  const present = new Set(head.map(tagKey));
  const added = extra.filter((entry) => {
    const key = tagKey(entry);
    return key === undefined || !present.has(key);
  });
  return [...head, ...added];
}
