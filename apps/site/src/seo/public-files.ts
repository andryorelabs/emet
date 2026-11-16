/**
 * The root-level files crawlers, browsers and security researchers fetch by a
 * well-known URL. Each is either copied from `public/` or rendered by a route
 * in `src/pages/`; the contract test and `docker/smoke.sh` hold the build and
 * the served image to this list.
 */
export const PUBLIC_FILES: readonly string[] = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/manifest.webmanifest",
  "/.well-known/security.txt",
  "/speculation-rules.json",
  "/favicon.ico",
  "/favicon.svg",
  "/apple-touch-icon.png",
];
