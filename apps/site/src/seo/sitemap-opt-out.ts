import type { AstroIntegration } from "astro";

/**
 * Occupies the `@astrojs/sitemap` slot so Starlight does not add its own
 * integration: `src/pages/sitemap.xml.ts` is the only sitemap.
 */
export const sitemapOptOut: AstroIntegration = { name: "@astrojs/sitemap", hooks: {} };
