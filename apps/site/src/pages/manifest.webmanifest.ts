import { buildWebManifest } from "../seo/share-meta";

/**
 * The web app manifest.
 * @returns The manifest response.
 */
export function GET(): Response {
  return new Response(JSON.stringify(buildWebManifest()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
