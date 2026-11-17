import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { REPOSITORY_ROOT } from "./paths";
import { PUBLISHED_SOURCES } from "./published";
import {
  collectReferencedImages,
  copyReferencedImages,
  copyRepoAssets,
  repoAssetPath,
  repoAssets,
  repoAssetsMiddleware,
  resolveRepoAsset,
  serveRepoAssets,
} from "./repo-assets";

const first = PUBLISHED_SOURCES[0];
if (first === undefined) throw new Error("no published sources");
const sourceDirectory = path.posix.dirname(first.sourcePath);

describe("repoAssetPath", () => {
  test("serves a repository path under /repo-assets/", () => {
    expect(repoAssetPath("docs/brand/logo/mark.svg")).toBe("/repo-assets/docs/brand/logo/mark.svg");
  });
});

describe("collectReferencedImages", () => {
  test("finds images of English sources and translations, skipping code and outsiders", () => {
    const english = [
      "![logo](../brand/logo/mark.svg)",
      "![outside](../../../outside.png)",
      '`<img src="../brand/skip.svg">`',
    ].join("\n");
    const translated = '<img src="../brand/mascot/mascot-done.svg" alt="x">';
    const found = collectReferencedImages(
      (sourcePath) => (sourcePath === first.sourcePath ? english : ""),
      (locale, id) => (locale === "es" && id === first.id ? translated : undefined),
    );
    expect(found).toEqual([
      path.posix.normalize(`${sourceDirectory}/../brand/logo/mark.svg`),
      path.posix.normalize(`${sourceDirectory}/../brand/mascot/mascot-done.svg`),
    ]);
  });
});

describe("copyRepoAssets", () => {
  let root: string;
  let dist: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "repo-assets-root-"));
    dist = mkdtempSync(path.join(tmpdir(), "repo-assets-dist-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  });

  test("copies files to the same-origin path", () => {
    mkdirSync(path.join(root, "docs/brand"), { recursive: true });
    writeFileSync(path.join(root, "docs/brand/a.svg"), "<svg/>");
    copyRepoAssets(["docs/brand/a.svg"], root, dist);
    expect(readFileSync(path.join(dist, "repo-assets/docs/brand/a.svg"), "utf8")).toBe("<svg/>");
  });

  test("throws when a referenced image is missing", () => {
    expect(() => {
      copyRepoAssets(["docs/missing.svg"], root, dist);
    }).toThrow(/missing\.svg/);
  });

  test("the integration copies every real referenced image on build", () => {
    expect(repoAssets().hooks["astro:build:done"]).toBe(copyReferencedImages);
    const referenced = collectReferencedImages();
    expect(referenced.length).toBeGreaterThan(0);
    copyReferencedImages({ dir: pathToFileURL(`${dist}/`) });
    for (const repositoryPath of referenced) {
      expect(existsSync(path.join(REPOSITORY_ROOT, repositoryPath))).toBe(true);
      expect(existsSync(path.join(dist, "repo-assets", repositoryPath))).toBe(true);
    }
  });
});

describe("resolveRepoAsset", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "repo-assets-dev-"));
    mkdirSync(path.join(root, "docs/brand"), { recursive: true });
    writeFileSync(path.join(root, "docs/brand/a.svg"), "<svg/>");
    writeFileSync(path.join(root, "docs/brand/secret.md"), "secret");
    writeFileSync(path.join(path.dirname(root), "repo-assets-outside.png"), "x");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(path.join(path.dirname(root), "repo-assets-outside.png"), { force: true });
  });

  test("resolves an allowed image with its content type", () => {
    expect(resolveRepoAsset("/repo-assets/docs/brand/a.svg", root)).toEqual({
      filePath: path.join(root, "docs/brand/a.svg"),
      contentType: "image/svg+xml",
    });
  });

  test("ignores a query string", () => {
    expect(resolveRepoAsset("/repo-assets/docs/brand/a.svg?v=1", root)?.contentType).toBe(
      "image/svg+xml",
    );
  });

  test("rejects traversal, encoded traversal, absolute paths and non-images", () => {
    const rejected = [
      "/repo-assets/../repo-assets-outside.png",
      "/repo-assets/docs/../../repo-assets-outside.png",
      "/repo-assets/%2e%2e/repo-assets-outside.png",
      "/repo-assets/docs/%2E%2E%2F..%2Frepo-assets-outside.png",
      "/repo-assets//etc/passwd.png",
      "/repo-assets/docs/brand/secret.md",
      "/repo-assets/docs%5C..%5Ca.svg",
      "/repo-assets/docs/a%00.svg",
      "/repo-assets/docs/brand/missing.svg",
      "/repo-assets/docs/brand",
      "/repo-assets/%E0%A4%A.svg",
      "/other/docs/brand/a.svg",
    ];
    for (const url of rejected) {
      expect(resolveRepoAsset(url, root), url).toBeUndefined();
    }
  });
});

describe("repoAssetsMiddleware", () => {
  interface Captured {
    status: number;
    headers: Record<string, string>;
    body: string | Uint8Array | undefined;
    nextCalled: boolean;
  }

  function run(url: string, root: string): Captured {
    const captured: Captured = { status: 0, headers: {}, body: undefined, nextCalled: false };
    const response = {
      statusCode: 0,
      setHeader(name: string, value: string) {
        captured.headers[name] = value;
      },
      end(body?: string | Uint8Array) {
        captured.status = this.statusCode;
        captured.body = body;
      },
    };
    repoAssetsMiddleware(root)({ url, method: "GET" }, response, () => {
      captured.nextCalled = true;
    });
    return captured;
  }

  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "repo-assets-mw-"));
    mkdirSync(path.join(root, "docs"), { recursive: true });
    writeFileSync(path.join(root, "docs/a.svg"), "<svg/>");
    writeFileSync(path.join(root, "docs/b.txt"), "text");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("serves a valid image with the right content type", () => {
    const result = run("/repo-assets/docs/a.svg", root);
    expect(result.status).toBe(200);
    expect(result.headers["Content-Type"]).toBe("image/svg+xml");
    expect(Buffer.from(result.body ?? "").toString("utf8")).toBe("<svg/>");
  });

  test("answers 404 to traversal, encoded traversal and non-image paths", () => {
    for (const url of [
      "/repo-assets/../package.json",
      "/repo-assets/%2e%2e/package.json",
      "/repo-assets/docs/b.txt",
    ]) {
      const result = run(url, root);
      expect(result.status, url).toBe(404);
      expect(result.nextCalled, url).toBe(false);
    }
  });

  test("passes other urls through", () => {
    expect(run("/docs/intro", root).nextCalled).toBe(true);
  });

  test("passes non-GET requests through", () => {
    const captured = { nextCalled: false };
    repoAssetsMiddleware(root)(
      { url: "/repo-assets/docs/a.svg", method: "POST" },
      { statusCode: 0, setHeader: () => undefined, end: () => undefined },
      () => {
        captured.nextCalled = true;
      },
    );
    expect(captured.nextCalled).toBe(true);
  });

  test("the integration registers the middleware on the dev server", () => {
    const used: unknown[] = [];
    expect(repoAssets().hooks["astro:server:setup"]).toBe(serveRepoAssets);
    serveRepoAssets({ server: { middlewares: { use: (handler) => used.push(handler) } } });
    expect(used).toHaveLength(1);
  });
});
