import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { sharedCodeConfig } from "./src/highlight/code-config";
import { DEFAULT_LOCALE, LOCALE_NAMES, LOCALES, localeSegment } from "./src/i18n/locales";

const starlightLocales = Object.fromEntries(
  LOCALES.map((locale) => [
    locale === DEFAULT_LOCALE ? "root" : localeSegment(locale),
    { label: LOCALE_NAMES[locale], lang: locale },
  ]),
);

export default defineConfig({
  site: "https://emet.andryore.dev",
  trailingSlash: "always",
  prefetch: false,
  security: {
    csp: true,
  },
  integrations: [
    starlight({
      title: "emet",
      defaultLocale: "root",
      locales: starlightLocales,
      lastUpdated: false,
      expressiveCode: { ...sharedCodeConfig, themes: [...sharedCodeConfig.themes] },
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
