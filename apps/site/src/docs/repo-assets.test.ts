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
