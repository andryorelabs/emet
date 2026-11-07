import { buildRobotsTxt } from "../seo/crawlers";

/**
 * The robots file: crawl everything, point at the sitemap.
 * @returns The plain-text response.
 */
export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
