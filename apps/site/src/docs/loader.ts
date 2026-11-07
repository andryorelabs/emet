import type { Loader, LoaderContext } from "astro/loaders";
import path from "node:path";

import { loadLocalizedCatalog } from "./catalog";
import { classifyTokenStyles } from "./code-classes";
import { REPOSITORY_ROOT, TRANSLATIONS_DIRECTORY } from "./paths";
import { PUBLISHED_SOURCES } from "./published";

const DOCS_DIRECTORY = path.join(REPOSITORY_ROOT, "docs");
const WATCHED_FILES = new Set(
  PUBLISHED_SOURCES.map((source) => path.join(REPOSITORY_ROOT, source.sourcePath)),
);

async function renderPage(context: LoaderContext, body: string) {
  const rendered = await context.renderMarkdown(body);
  return { ...rendered, html: classifyTokenStyles(rendered.html) };
}

async function fillStore(context: LoaderContext): Promise<void> {
  const entries = await Promise.all(
    loadLocalizedCatalog().map(async (page) => ({
      page,
      data: await context.parseData({
        id: page.id,
        data: {
          title: page.title,
          description: page.description,
          seoTitle: page.seoTitle,
          editUrl: page.editUrl,
          translationStatus: page.status,
          englishPath: page.englishPath,
        },
      }),
      rendered: await renderPage(context, page.body),
    })),
  );
  context.store.clear();
  for (const { page, data, rendered } of entries) {
    context.store.set({
      id: page.id,
      data,
      body: page.body,
      digest: context.generateDigest(`${page.status}:${page.body}`),
      rendered,
    });
  }
}

function isWatchedFile(file: string): boolean {
  return (
    WATCHED_FILES.has(file) ||
    file.startsWith(DOCS_DIRECTORY) ||
    file.startsWith(TRANSLATIONS_DIRECTORY)
  );
}

/**
 * Content loader for the Starlight `docs` collection: one entry per published
 * source and locale, read from the repository at build time and never copied
 * into the site. In dev it watches the docs folder, the translations and
 * `CHANGELOG.md` and refills the store on every change.
 * @returns A loader that fills the store on every build and file change.
 */
export function catalogLoader(): Loader {
  return {
    name: "emet-docs-catalog",
    async load(context) {
      await fillStore(context);
      const { watcher } = context;
      if (!watcher) return;
      watcher.add([DOCS_DIRECTORY, TRANSLATIONS_DIRECTORY, ...WATCHED_FILES]);
      const onFileEvent = (file: string): void => {
        if (!isWatchedFile(file)) return;
        fillStore(context).catch((error: unknown) => {
          context.logger.error(error instanceof Error ? error.message : String(error));
        });
      };
      watcher.on("change", onFileEvent);
      watcher.on("add", onFileEvent);
      watcher.on("unlink", onFileEvent);
    },
  };
}
