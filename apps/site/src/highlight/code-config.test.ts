import { expect, test } from "bun:test";
import { ExpressiveCode, loadShikiTheme } from "expressive-code";

import { sharedCodeConfig } from "./code-config";

async function renderThemeCss(): Promise<string> {
  const themes = await Promise.all(sharedCodeConfig.themes.map((name) => loadShikiTheme(name)));
  const engine = new ExpressiveCode({
    themes,
    themeCssSelector: sharedCodeConfig.themeCssSelector,
    useDarkModeMediaQuery: sharedCodeConfig.useDarkModeMediaQuery,
    styleOverrides: sharedCodeConfig.styleOverrides,
  });
  return `${await engine.getBaseStyles()}${await engine.getThemeStyles()}`;
}

test("themeCssSelector maps dark to .dark and light to .light", () => {
  expect(sharedCodeConfig.themeCssSelector({ type: "dark" })).toBe(".dark");
  expect(sharedCodeConfig.themeCssSelector({ type: "light" })).toBe(".light");
});

test("the OS dark media query targets :root:not(.light), never :root:not(:root)", async () => {
  const css = await renderThemeCss();
  expect(css).not.toContain(":root:not(:root)");
  const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
  expect(mediaStart).toBeGreaterThanOrEqual(0);
  expect(css.slice(mediaStart)).toContain(":root:not(.light)");
});
