import { loadLocalizedCatalog } from "../docs/catalog";
import { buildLlmsFullTxt } from "../docs/markdown-twin";

/**
 * The `llms-full.txt` file: every English page's Markdown twin.
 * @returns The plain-text response.
 */
export function GET(): Response {
  return new Response(buildLlmsFullTxt(loadLocalizedCatalog()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
