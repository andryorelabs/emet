import { ExpressiveCode, loadShikiTheme } from "expressive-code";
import { toHtml } from "hast-util-to-html";

import { sharedCodeConfig } from "./code-config";

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
 * Highlights code at build time with the shared Expressive Code config. The
 * page ships no highlighter; every token carries its light and dark colours as
 * `--0` and `--1` custom properties that `code.css` picks from.
 * @param code - The plain source text.
 * @param lang - The language id, such as `bash` or `json`; unknown ids render as plain text.
 * @returns The highlighted markup of one code block, without a frame.
 */
export async function renderCode(code: string, lang: string): Promise<string> {
  enginePromise ??= createEngine();
  const engine = await enginePromise;
  const { renderedGroupAst } = await engine.render({ code, language: lang });
  return toHtml(renderedGroupAst);
}
