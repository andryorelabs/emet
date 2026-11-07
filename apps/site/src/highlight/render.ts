import { ExpressiveCode, loadShikiTheme } from "expressive-code";
import { toHtml } from "hast-util-to-html";

import { sharedCodeConfig } from "./code-config";
import { parseTokenStyle, tokenClasses } from "./token-style";

/** One highlighted block: its markup and the CSS rules its token classes need. */
export interface RenderedCode {
  html: string;
  css: string;
}

interface TreeNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
}

let enginePromise: Promise<ExpressiveCode> | undefined;

async function createEngine(): Promise<ExpressiveCode> {
  const themes = await Promise.all(sharedCodeConfig.themes.map((name) => loadShikiTheme(name)));
  return new ExpressiveCode({
    themes,
    themeCssSelector: sharedCodeConfig.themeCssSelector,
    useDarkModeMediaQuery: sharedCodeConfig.useDarkModeMediaQuery,
    styleOverrides: sharedCodeConfig.styleOverrides,
    frames: false,
  });
}

/**
 * Replaces every token `style` attribute with a class, because the page's
 * hash-based CSP drops inline style attributes.
 * @param node - The rendered tree, changed in place.
 * @param rules - Collects one CSS rule per distinct colour pair, by class name.
 */
function classifyTokens(node: TreeNode, rules: Map<string, string>): void {
  if (node.type === "element" && node.properties) {
    const style = node.properties["style"];
    const parsed = typeof style === "string" ? parseTokenStyle(style) : null;
    if (parsed !== null) {
      const classes = tokenClasses(parsed);
      for (const { name, rule } of classes) rules.set(name, rule);
      const existing: unknown = node.properties["className"];
      delete node.properties["style"];
      node.properties["className"] = [
        ...(Array.isArray(existing)
          ? existing.filter((name): name is string => typeof name === "string")
          : []),
        ...classes.map(({ name }) => name),
      ];
    }
  }
  if (node.children) {
    for (const child of node.children) classifyTokens(child, rules);
  }
}

/**
 * Highlights code at build time and returns the markup with the stylesheet its
 * token classes need. Token colours are classes holding `light-dark()`, never
 * inline style attributes.
 * @param code - The plain source text.
 * @param lang - The language id, such as `bash` or `json`.
 * @returns The markup of one frameless block and its CSS rules.
 */
export async function renderCodeWithStyles(code: string, lang: string): Promise<RenderedCode> {
  enginePromise ??= createEngine();
  const engine = await enginePromise;
  const { renderedGroupAst } = await engine.render({ code, language: lang });
  const rules = new Map<string, string>();
  classifyTokens(renderedGroupAst, rules);
  return { html: toHtml(renderedGroupAst), css: [...rules.values()].join("") };
}

/**
 * Highlights code at build time with the shared Expressive Code config.
 * @param code - The plain source text.
 * @param lang - The language id, such as `bash` or `json`; unknown ids render as plain text.
 * @returns The highlighted markup of one code block, without a frame.
 */
export async function renderCode(code: string, lang: string): Promise<string> {
  return (await renderCodeWithStyles(code, lang)).html;
}
