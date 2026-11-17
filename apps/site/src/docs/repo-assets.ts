import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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
 * Astro integration that copies every repository image the published docs
 * reference into the build output, so the site serves them same-origin.
 * @returns The integration.
 */
export function repoAssets(): AstroIntegration {
  return {
    name: "emet-repo-assets",
    hooks: { "astro:build:done": copyReferencedImages },
  };
}
