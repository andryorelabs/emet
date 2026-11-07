import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

import { installLinkTags, shareMetaTags, splitLocalePath } from "../seo/share-meta";
import { applySeoTitle, mergeMissingTags } from "./page-meta";

/**
 * Swaps a page's `<title>` and `og:title` for its SEO title, adds the share
 * image, install and `describedby` tags Starlight does not emit, and marks the
 * content of a page that renders the English text as English, so the content
 * wrapper carries `lang="en"` and assistive technology switches voice. The
 * page chrome keeps the locale of the route.
 */
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  const { seoTitle, title, translationStatus } = route.entry.data;
  const { locale, path } = splitLocalePath(context.url.pathname);
  const description = route.entry.data.description ?? "";
  const swapped = applySeoTitle(route.head, title, seoTitle).filter(
    (entry) => entry.attrs?.["property"] !== "og:locale",
  );
  const share = shareMetaTags(locale, path, seoTitle ?? title, description);
  route.head = mergeMissingTags(swapped, [...share, ...installLinkTags()]);
  if (translationStatus === "translated") return;
  route.entryMeta = { ...route.entryMeta, lang: "en", dir: "ltr" };
});
