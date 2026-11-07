import { type LinkContext, rewriteImageSource, rewriteLink } from "./links";

const HTML_IMAGE_SOURCE = /(<img\b[^>]*?\ssrc=")([^"]+)(")/gi;
const MARKDOWN_IMAGE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
const LEADING_H1 = /^\s*# +(.+?) *#*[ \t]*(?:\r?\n+|$)/;
const INLINE_LINK = /(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
const REFERENCE_DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s+)(\S+)/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Splits a markdown document into its leading H1 and the rest.
 * @param markdown - Raw markdown.
 * @returns The H1 text (`undefined` when the file has none) and the body
 * without that heading.
 */
export function splitLeadingHeading(markdown: string): {
  title: string | undefined;
  body: string;
} {
  const match = LEADING_H1.exec(markdown);
  if (!match) return { title: undefined, body: markdown };
  return {
    title: match[1]?.replaceAll(/[`*_]/g, "").trim(),
    body: markdown.slice(match[0].length),
  };
}

function rewriteImages(segment: string, context: LinkContext): string {
  return segment
    .replaceAll(
      HTML_IMAGE_SOURCE,
      (_whole, open: string, src: string, close: string) =>
        `${open}${rewriteImageSource(src, context)}${close}`,
    )
    .replaceAll(
      MARKDOWN_IMAGE,
      (_whole, open: string, src: string, close: string) =>
        `${open}${rewriteImageSource(src, context)}${close}`,
    );
}

function rewriteLine(line: string, context: LinkContext): string {
  const definition = REFERENCE_DEFINITION.exec(line);
  if (definition) {
    const [whole = "", prefix = "", href = ""] = definition;
    return `${prefix}${rewriteLink(href, context)}${line.slice(whole.length)}`;
  }
  return line
    .split("`")
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : rewriteImages(segment, context).replaceAll(
            INLINE_LINK,
            (_whole, open: string, href: string, close: string) =>
              `${open}${rewriteLink(href, context)}${close}`,
          ),
    )
    .join("`");
}

/**
 * Rewrites every inline and reference link of a markdown document with
 * `rewriteLink`, leaving fenced code blocks and inline code untouched.
 * @param markdown - Markdown of a published source.
 * @param context - Source file and locale of the page.
 * @returns The markdown with rewritten link targets.
 */
export function rewriteMarkdownLinks(markdown: string, context: LinkContext): string {
  let isInsideFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        isInsideFence = !isInsideFence;
        return line;
      }
      return isInsideFence ? line : rewriteLine(line, context);
    })
    .join("\n");
}
