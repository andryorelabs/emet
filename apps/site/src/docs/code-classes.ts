import { renderCodeWithStyles } from "../highlight/render";

const TOKEN_STYLE_ATTRIBUTE =
  /<span style="--0:\s*#([0-9a-fA-F]+);\s*--1:\s*#([0-9a-fA-F]+);?\s*">/g;
const FENCED_BLOCK = /^(?<fence>```|~~~)(?<info>[^\n]*)\n(?<code>[\s\S]*?)\n\k<fence>[ \t]*$/gm;

/**
 * A fenced code block found in a markdown body.
 */
interface FencedBlock {
  lang: string;
  code: string;
}

/**
 * Replaces the inline `style="--0:#a;--1:#b"` Expressive Code puts on every
 * token with a `tk-a-b` class, because the site's hash-based CSP drops inline
 * style attributes. The class names match `renderCodeWithStyles`, which writes
 * the rules (see `buildCodeColorsCss`).
 * @param html - Rendered markdown containing Expressive Code output.
 * @returns The same markup with no token style attributes.
 */
export function classifyTokenStyles(html: string): string {
  return html.replaceAll(
    TOKEN_STYLE_ATTRIBUTE,
    (_whole, light: string, dark: string) =>
      `<span class="tk-${light.toLowerCase()}-${dark.toLowerCase()}">`,
  );
}

/**
 * Finds the fenced code blocks of a markdown body.
 * @param markdown - A markdown body.
 * @returns One entry per block, with its language id (empty for plain text).
 */
function findFencedBlocks(markdown: string): FencedBlock[] {
  return [...markdown.matchAll(FENCED_BLOCK)].map((match) => ({
    lang: (match.groups?.["info"] ?? "").trim().split(/\s+/)[0] ?? "",
    code: match.groups?.["code"] ?? "",
  }));
}

/**
 * Builds the stylesheet for the token classes of every code block in the given
 * bodies. Each class holds a `light-dark()` colour pair.
 * @param bodies - Markdown bodies of the docs pages.
 * @returns The CSS rules, one per distinct colour pair.
 */
export async function buildCodeColorsCss(bodies: readonly string[]): Promise<string> {
  const results = await Promise.all(
    bodies
      .flatMap((body) => findFencedBlocks(body))
      .map((block) => renderCodeWithStyles(block.code, block.lang || "text")),
  );
  const rules = new Set(results.flatMap(({ css }) => css.match(/\.tk-[^}]+}/g) ?? []));
  return [...rules].toSorted().join("\n");
}
