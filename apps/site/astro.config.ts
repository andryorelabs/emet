import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { codeColorsPlugin } from "./src/docs/code-colors-plugin";
import { sharedCodeConfig } from "./src/highlight/code-config";
import { collectStarlightInlineScriptHashes } from "./src/docs/starlight-inline-hashes";
import { buildSidebar } from "./src/docs/sidebar";
import {
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  LOCALES,
  localePath,
  localeSegment,
} from "./src/i18n/locales";

const starlightLocales = Object.fromEntries(
  LOCALES.map((locale) => [
    locale === DEFAULT_LOCALE ? "root" : localeSegment(locale),
    { label: LOCALE_NAMES[locale], lang: locale },
  ]),
);

const docsRedirects = Object.fromEntries(
  LOCALES.map((locale) => [
    localePath(locale, "/docs/"),
    localePath(locale, "/docs/guide/getting-started/"),
  ]),
);

export default defineConfig({
  site: "https://emet.andryore.dev",
  trailingSlash: "always",
  prefetch: false,
  redirects: docsRedirects,
  security: {
    csp: {
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'"],
        hashes: collectStarlightInlineScriptHashes(),
      },
    },
  },
  integrations: [
    starlight({
      title: "emet",
      disable404Route: true,
      defaultLocale: "root",
      locales: starlightLocales,
      sidebar: buildSidebar(),
      customCss: ["./src/styles/docs.css"],
      routeMiddleware: "./src/docs/route-middleware.ts",
      lastUpdated: false,
      expressiveCode: { ...sharedCodeConfig, themes: [...sharedCodeConfig.themes] },
      components: {
        Header: "./src/components/docs/DocsHeader.astro",
        Footer: "./src/components/docs/DocsFooter.astro",
        PageTitle: "./src/components/docs/DocsPageTitle.astro",
        ThemeProvider: "./src/components/docs/Empty.astro",
        ThemeSelect: "./src/components/docs/Empty.astro",
        LanguageSelect: "./src/components/docs/Empty.astro",
        SocialIcons: "./src/components/docs/Empty.astro",
      },
    }),
  ],
  vite: { plugins: [tailwindcss(), codeColorsPlugin()] },
});
