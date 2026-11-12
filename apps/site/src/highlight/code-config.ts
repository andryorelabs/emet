/**
 * The Expressive Code options shared by the home page's code blocks and by
 * Starlight, so a block looks the same everywhere. Colours come from the brand
 * tokens through CSS variables. No block shows line numbers, so the
 * line-number plugin is not loaded. The theme selectors are the `.light` and
 * `.dark` classes the theme script sets on `<html>`; with System, neither is
 * set, so the OS dark media query applies to `:root:not(.light)`.
 */
export const sharedCodeConfig = {
  themes: ["github-light", "github-dark"],
  themeCssSelector: (theme: { type: string }): ".dark" | ".light" =>
    theme.type === "dark" ? ".dark" : ".light",
  useDarkModeMediaQuery: true,
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
      terminalBackground: "var(--surface)",
      terminalTitlebarBackground: "var(--surface)",
      terminalTitlebarForeground: "var(--text-muted)",
      terminalTitlebarDotsOpacity: "0",
      terminalTitlebarBorderBottomColor: "var(--border)",
      editorBackground: "var(--surface)",
      editorTabBarBackground: "var(--surface)",
      editorTabBarBorderColor: "var(--border)",
      editorTabBarBorderBottomColor: "var(--border)",
      editorActiveTabBackground: "var(--surface)",
      editorActiveTabForeground: "var(--text-muted)",
      editorActiveTabBorderColor: "transparent",
      editorActiveTabIndicatorTopColor: "transparent",
      editorActiveTabIndicatorBottomColor: "transparent",
      inlineButtonForeground: "var(--text-muted)",
      inlineButtonBackground: "transparent",
    },
  },
} as const;
