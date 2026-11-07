import { PUBLISHED_SOURCES } from "../docs/published";
import { en } from "../i18n/ui/en";
import { buildLlmsTxt } from "../seo/crawlers";

/**
 * The `llms.txt` file: a project summary and links to the docs pages.
 * @returns The plain-text response.
 */
export function GET(): Response {
  return new Response(buildLlmsTxt(en.meta.description, PUBLISHED_SOURCES), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
