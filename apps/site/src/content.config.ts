import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

import { catalogLoader } from "./docs/loader";

export const collections = {
  docs: defineCollection({
    loader: catalogLoader(),
    schema: docsSchema({
      extend: z.object({
        seoTitle: z.string().optional(),
        translationStatus: z.enum(["translated", "missing", "stale"]),
        englishPath: z.string(),
      }),
    }),
  }),
};
