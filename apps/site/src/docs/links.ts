import path from "node:path";

import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";
import { githubViewUrl } from "./paths";
import { findPublishedSource, publishedRoute } from "./published";

const EXTERNAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Where a link was found and which locale is being rendered.
 */
export interface LinkContext {
  /**
   * Repository path of the file containing the link.
   */
  sourcePath: string;
  /**
   * Locale of the page being rendered. Defaults to English.
   */
  locale?: Locale;
}

function resolveRepositoryPath(src: string, context: LinkContext): string | undefined {
  if (src === "" || src.startsWith("#") || EXTERNAL_HREF.test(src)) return undefined;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(context.sourcePath), src),
  );
  if (resolved === ".." || resolved.startsWith("../")) return undefined;
  return resolved;
}

/**
 * Rewrites one image source found in a published source to the GitHub raw URL
 * of the repository file, since the site does not serve the repository tree.
 * Absolute URLs and targets outside the repository stay as written.
 * @param src - The image source exactly as written in the markdown.
 * @param context - Source file and locale of the page.
 * @returns The rewritten source.
 */
export function rewriteImageSource(src: string, context: LinkContext): string {
  const repositoryPath = resolveRepositoryPath(src, context);
  if (repositoryPath === undefined) return src;
  return githubViewUrl(repositoryPath)
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/blob/", "/");
}

/**
 * Rewrites one markdown link target found in a published source. Published
 * files become localized site routes, any other repository file becomes a
 * GitHub URL, and absolute URLs, same-page anchors and targets outside the
 * repository stay as written.
 * @param href - The link target exactly as written in the markdown.
 * @param context - Source file and locale of the page.
 * @returns The rewritten target.
 */
export function rewriteLink(href: string, context: LinkContext): string {
  if (href === "" || href.startsWith("#") || EXTERNAL_HREF.test(href)) {
    return href;
  }
  const hashIndex = href.indexOf("#");
  const target = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex);
  if (target === "") return href;

  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(context.sourcePath), target),
  );
  if (resolved === ".." || resolved.startsWith("../")) return href;
  const repositoryPath = resolved.replace(/\/$/, "");

  const source = findPublishedSource(repositoryPath);
  return source
    ? `${publishedRoute(source, context.locale ?? DEFAULT_LOCALE)}${fragment}`
    : `${githubViewUrl(repositoryPath, target.endsWith("/"))}${fragment}`;
}
