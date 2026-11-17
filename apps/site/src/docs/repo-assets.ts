import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

import { LOCALES } from "../i18n/locales";
import { rewriteMarkdownLinks } from "./markdown";
import { REPOSITORY_ROOT } from "./paths";
import { PUBLISHED_SOURCES } from "./published";
import { readRepositorySource, readTranslationFile, type SourceReader } from "./translations";

/**
 * Same-origin folder of the build output that holds the repository images the
 * docs reference, mirroring their repository paths.
 */
export const REPO_ASSETS_PREFIX = "/repo-assets/";

const REPO_ASSET_REFERENCE = /\/repo-assets\/[^"\s)]+/g;

/**
 * The same-origin path under which a repository file is served.
 * @param repositoryPath - Path relative to the repository root, using `/`.
 * @returns The path, such as `/repo-assets/docs/brand/logo/mark.svg`.
 */
export function repoAssetPath(repositoryPath: string): string {
  return `${REPO_ASSETS_PREFIX}${repositoryPath}`;
}

/**
 * Lists the repository files that the published docs reference as images, in
 * English and in every translation.
 * @param readSource - Reads a published source by repository path.
 * @param readTranslation - Reads a translation by locale and page id.
 * @returns Sorted, unique repository paths.
 */
export function collectReferencedImages(
  readSource: SourceReader = readRepositorySource,
  readTranslation: typeof readTranslationFile = readTranslationFile,
): string[] {
  const found = new Set<string>();
  for (const source of PUBLISHED_SOURCES) {
    const texts = [
      readSource(source.sourcePath),
      ...LOCALES.map((locale) => readTranslation(locale, source.id)),
    ];
    for (const text of texts) {
      if (text === undefined) continue;
      const rewritten = rewriteMarkdownLinks(text, { sourcePath: source.sourcePath });
      for (const match of rewritten.matchAll(REPO_ASSET_REFERENCE)) {
        found.add(match[0].slice(REPO_ASSETS_PREFIX.length));
      }
    }
  }
  return [...found].toSorted();
}

/**
 * Copies repository files into `<distDirectory>/repo-assets/<repository path>`.
 * @param repositoryPaths - Repository-relative paths to copy.
 * @param repositoryRoot - Absolute repository root.
 * @param distDirectory - Absolute build output directory.
 * @throws When a referenced file does not exist.
 */
export function copyRepoAssets(
  repositoryPaths: readonly string[],
  repositoryRoot: string,
  distDirectory: string,
): void {
  for (const repositoryPath of repositoryPaths) {
    const from = path.join(repositoryRoot, repositoryPath);
    if (!existsSync(from)) {
      throw new Error(`repo-assets: referenced image ${repositoryPath} does not exist`);
    }
    const to = path.join(distDirectory, REPO_ASSETS_PREFIX, repositoryPath);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

/**
 * Copies every referenced repository image into a build output directory.
 * @param options - The build hook options; `dir` is the build output directory.
 */
export function copyReferencedImages({ dir }: { dir: URL }): void {
  copyRepoAssets(collectReferencedImages(), REPOSITORY_ROOT, fileURLToPath(dir));
}

/**
 * Content types of the image files the dev server serves under `/repo-assets/`,
 * keyed by lowercase extension.
 */
const REPO_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

/** A repository image resolved for serving. */
interface ResolvedRepoAsset {
  filePath: string;
  contentType: string;
}

function decodeRepositoryPath(urlPath: string): string | undefined {
  if (!urlPath.startsWith(REPO_ASSETS_PREFIX)) return undefined;
  const encoded = urlPath.slice(REPO_ASSETS_PREFIX.length).split(/[?#]/, 1)[0] ?? "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function isSafeRepositoryPath(repositoryPath: string): boolean {
  if (repositoryPath === "" || repositoryPath.includes("\\") || repositoryPath.includes("\0")) {
    return false;
  }
  if (repositoryPath.startsWith("/") || path.isAbsolute(repositoryPath)) return false;
  return !repositoryPath.split("/").includes("..");
}

/**
 * Maps a dev-server URL to a repository image, applying the same image
 * allowlist as the build and a path-traversal guard.
 * @param urlPath - Request URL, such as `/repo-assets/docs/brand/logo/mark.svg`.
 * @param repositoryRoot - Absolute repository root.
 * @returns The file and content type, or `undefined` when the URL is not an
 * existing allowed image inside the repository.
 */
export function resolveRepoAsset(
  urlPath: string,
  repositoryRoot: string,
): ResolvedRepoAsset | undefined {
  const repositoryPath = decodeRepositoryPath(urlPath);
  if (repositoryPath === undefined || !isSafeRepositoryPath(repositoryPath)) return undefined;
  const contentType = REPO_ASSET_CONTENT_TYPES[path.extname(repositoryPath).toLowerCase()];
  if (contentType === undefined) return undefined;
  const root = path.resolve(repositoryRoot);
  const filePath = path.resolve(root, repositoryPath);
  const relative = path.relative(root, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return undefined;
  return { filePath, contentType };
}

interface DevRequest {
  url?: string | undefined;
  method?: string | undefined;
}

interface DevResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string | Uint8Array): unknown;
}

/**
 * Builds the dev-server middleware that serves `GET /repo-assets/<path>` from
 * the repository root and answers 404 to anything it refuses.
 * @param repositoryRoot - Absolute repository root.
 * @returns A connect-style middleware.
 */
export function repoAssetsMiddleware(
  repositoryRoot: string,
): (request: DevRequest, response: DevResponse, next: () => void) => void {
  return (request, response, next) => {
    const url = request.url ?? "";
    if (request.method !== "GET" || !url.startsWith(REPO_ASSETS_PREFIX)) {
      next();
      return;
    }
    const asset = resolveRepoAsset(url, repositoryRoot);
    if (asset === undefined) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", asset.contentType);
    response.end(readFileSync(asset.filePath));
  };
}

/**
 * The `astro:server:setup` hook: registers the `/repo-assets/` middleware on
 * the dev server.
 * @param options - The hook options; only the dev server's connect stack is used.
 * @param options.server - The dev server.
 * @param options.server.middlewares - The connect middleware stack.
 * @param options.server.middlewares.use - Adds a middleware to the stack.
 */
export function serveRepoAssets({
  server,
}: {
  server: { middlewares: { use: (handler: ReturnType<typeof repoAssetsMiddleware>) => unknown } };
}): void {
  server.middlewares.use(repoAssetsMiddleware(REPOSITORY_ROOT));
}

/**
 * Astro integration that copies every repository image the published docs
 * reference into the build output, so the site serves them same-origin, and
 * serves them from the repository root under `astro dev`.
 * @returns The integration.
 */
export function repoAssets(): AstroIntegration {
  return {
    name: "emet-repo-assets",
    hooks: {
      "astro:build:done": copyReferencedImages,
      "astro:server:setup": serveRepoAssets,
    },
  };
}
