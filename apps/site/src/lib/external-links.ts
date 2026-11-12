const OWN_HOST = "emet.andryore.dev";
const BASE_URL = `https://${OWN_HOST}`;
const ANCHOR = /<a(\s(?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a>/g;
const REL_ATTRIBUTE = /\srel="([^"]*)"/;
const HREF_ATTRIBUTE = /\shref="([^"]*)"/;
const TARGET_ATTRIBUTE = /\starget=/;
const NEW_TAB_REL = ["noopener", "noreferrer"];

/**
 * Attributes that open a link in a new tab.
 */
interface ExternalLinkAttributes {
  target?: "_blank";
  rel?: string;
}

/**
 * Whether an href leaves the site: an absolute http(s) URL, or a
 * protocol-relative one, whose host is not the site's own.
 * @param href - The link target as written.
 * @returns True for an external page; false for relative paths, anchors, the
 * own host and non-http schemes such as `mailto:`.
 */
export function isExternalHref(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    return false;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== OWN_HOST;
}

/**
 * The attributes a link needs: `target="_blank"` and a `rel` with `noopener
 * noreferrer` merged into any existing tokens, for an external href.
 * @param href - The link target.
 * @param rel - The `rel` the link already carries, e.g. `author`.
 * @returns The attributes to spread on the anchor; an internal link keeps its
 * own `rel` and gets no `target`.
 */
export function externalLinkAttributes(href: string, rel?: string): ExternalLinkAttributes {
  if (!isExternalHref(href)) return rel === undefined ? {} : { rel };
  const tokens = [...(rel?.split(/\s+/) ?? []), ...NEW_TAB_REL].filter(Boolean);
  return { target: "_blank", rel: [...new Set(tokens)].join(" ") };
}

/**
 * Opens every external `<a>` of rendered HTML in a new tab and appends a
 * visually hidden label to it. Only anchor elements are rewritten, so code
 * spans and fenced code stay untouched.
 * @param html - Rendered HTML.
 * @param newTabLabel - The localized "(opens in a new tab)" text.
 * @returns The HTML with external anchors marked.
 */
export function markExternalLinks(html: string, newTabLabel: string): string {
  return html.replaceAll(ANCHOR, (whole, attributes: string, content: string) => {
    const href = HREF_ATTRIBUTE.exec(attributes)?.[1];
    if (href === undefined || !isExternalHref(href) || TARGET_ATTRIBUTE.test(attributes)) {
      return whole;
    }
    const existingRel = REL_ATTRIBUTE.exec(attributes)?.[1];
    const rest = attributes.replace(REL_ATTRIBUTE, "").trimEnd();
    const { rel } = externalLinkAttributes(href, existingRel);
    return `<a${rest} target="_blank" rel="${rel}">${content}<span class="sr-only">${newTabLabel}</span></a>`;
  });
}
