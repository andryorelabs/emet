import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

import { THEME_INIT_HASH } from "./src/components/site/theme";
import { codeColorsPlugin } from "./src/docs/code-colors-plugin";
import { emetDirectives } from "./src/docs/directives";
import { repoAssets } from "./src/docs/repo-assets";
import { buildSidebar } from "./src/docs/sidebar";
import {
  collectStarlightInlineScriptHashes,
  collectStarlightInlineStyleHashes,
} from "./src/docs/starlight-inline-hashes";
import { sharedCodeConfig } from "./src/highlight/code-config";
import {
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  LOCALES,
  localePath,
  localeSegment,
} from "./src/i18n/locales";
import { sitemapOptOut } from "./src/seo/sitemap-opt-out";

const starlightLocales = Object.fromEntries(
  LOCALES.map((locale) => [
    locale === DEFAULT_LOCALE ? "root" : localeSegment(locale),
    { label: LOCALE_NAMES[locale], lang: locale },
  ]),
);

const INSTALL_SCRIPT_URL =
  "https://github.com/andryorelabs/emet/releases/latest/download/install.sh";

const docsRedirects = {
  ...Object.fromEntries(
    LOCALES.map((locale) => [
      localePath(locale, "/docs/"),
      localePath(locale, "/docs/guide/getting-started/"),
    ]),
  ),
  "/install.sh": { status: 302 as const, destination: INSTALL_SCRIPT_URL },
};

export default defineConfig({
  site: "https://emet.andryore.dev",
  trailingSlash: "always",
  prefetch: false,
  redirects: docsRedirects,
  security: {
    csp: {
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'"],
        hashes: [...collectStarlightInlineScriptHashes(), THEME_INIT_HASH],
      },
      styleDirective: {
        resources: [{ resource: "'unsafe-hashes'", kind: "attribute" }],
        hashes: collectStarlightInlineStyleHashes().map((hash) => ({ hash, kind: "attribute" })),
      },
    },
  },
  integrations: [
    sitemapOptOut,
    emetDirectives(),
    repoAssets(),
    starlight({
      title: "emet",
      head: [
        { tag: "link", attrs: { rel: "sitemap", href: "/sitemap.xml" } },
        { tag: "link", attrs: { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" } },
      ],
      disable404Route: true,
      defaultLocale: "root",
      locales: starlightLocales,
      sidebar: buildSidebar(),
      customCss: [
        "./src/styles/docs.css",
        "./src/styles/search-dialog.css",
        "./src/styles/docs-steps.css",
        "./src/styles/install-tabs.css",
      ],
      routeMiddleware: "./src/docs/route-middleware.ts",
      lastUpdated: false,
      expressiveCode: { ...sharedCodeConfig, themes: [...sharedCodeConfig.themes] },
      components: {
        Header: "./src/components/docs/DocsHeader.astro",
        Footer: "./src/components/docs/DocsFooter.astro",
        PageTitle: "./src/components/docs/DocsPageTitle.astro",
        ThemeProvider: "./src/components/docs/ThemeProvider.astro",
        ThemeSelect: "./src/components/docs/Empty.astro",
        LanguageSelect: "./src/components/docs/Empty.astro",
        SocialIcons: "./src/components/docs/Empty.astro",
      },
    }),
  ],
  vite: { plugins: [tailwindcss(), codeColorsPlugin()] },
});
