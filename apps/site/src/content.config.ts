import { docsSchema } from "@astrojs/starlight/schema";
import type { Loader } from "astro/loaders";
import { defineCollection } from "astro:content";

/**
 * Repository files published as docs, read in place at build time. Empty until
 * the docs ticket fills it, so Starlight renders no doc pages yet.
 */
const DOCS_ALLOWLIST: readonly string[] = [];

/**
 * Loads the allowlisted repository docs into Starlight's `docs` collection.
 * A stub for now: it clears the store and loads the empty allowlist.
 * @returns The content loader.
 */
function allowlistLoader(): Loader {
  return {
    name: "emet-docs-allowlist",
    load: ({ store, logger }) => {
      store.clear();
      logger.info(`${DOCS_ALLOWLIST.length} allowlisted docs`);
      return Promise.resolve();
    },
  };
}

export const collections = {
  docs: defineCollection({ loader: allowlistLoader(), schema: docsSchema() }),
};
