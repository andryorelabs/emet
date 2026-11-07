/**
 * The Expressive Code options shared by the home page's code blocks and by
 * Starlight, so a block looks the same everywhere. Colours come from the brand
 * tokens through CSS variables. No block shows line numbers, so the
 * line-number plugin is not loaded.
 */
export const sharedCodeConfig = {
  themes: ["github-light", "github-dark"],
  themeCssSelector: (theme: { type: string }): string =>
    theme.type === "dark" ? ".dark" : ":root",
  useDarkModeMediaQuery: false,
  useStarlightDarkModeSwitch: false,
  useStarlightUiThemeColors: false,
  styleOverrides: {
    borderRadius: "12px",
    borderWidth: "1px",
    borderColor: "var(--border)",
    codeBackground: "var(--surface)",
    codeFontFamily: "var(--font-mono)",
    codeFontSize: "13px",
    uiFontFamily: "var(--font-sans)",
    frames: {
      frameBoxShadowCssValue: "none",
    },
  },
} as const;
