import { buildRobotsTxt } from "../seo/crawlers";

/**
 * The robots file: search crawlers allowed, AI-training crawlers disallowed,
 * the sitemap listed.
 * @returns The plain-text response.
 */
export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
