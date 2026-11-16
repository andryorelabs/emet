import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_FILES } from "./public-files";

const siteRoot = fileURLToPath(new URL("../../", import.meta.url));
const publicDirectory = path.join(siteRoot, "public");
const smoke = readFileSync(path.join(siteRoot, "docker/smoke.sh"), "utf8");
const siteConf = readFileSync(path.join(siteRoot, "docker/site.conf"), "utf8");

const SERVED_EXTENSIONS = new Set([".png", ".ico", ".svg", ".woff2", ".md", ".json"]);

function publicPaths(): string[] {
  return readdirSync(publicDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(publicDirectory, path.join(entry.parentPath, entry.name)));
}

function isBuilt(url: string): boolean {
  const relative = url.slice(1);
  return (
    existsSync(path.join(publicDirectory, relative)) ||
    existsSync(path.join(siteRoot, "src/pages", `${relative}.ts`))
  );
}

describe("PUBLIC_FILES", () => {
  test("lists root-level URLs, each once", () => {
    expect(new Set(PUBLIC_FILES).size).toBe(PUBLIC_FILES.length);
    for (const url of PUBLIC_FILES) expect(url).toMatch(/^\/[\w.-]+(?:\/[\w.-]+)?$/);
  });

  test("backs every file with a public/ copy or a route", () => {
    expect(PUBLIC_FILES.filter((url) => !isBuilt(url))).toEqual([]);
  });

  test("is fetched by the image smoke test", () => {
    for (const url of PUBLIC_FILES) expect(smoke).toContain(url);
  });
});

describe("public/", () => {
  test("holds no scripts or pages, only static assets", () => {
    const unexpected = publicPaths().filter(
      (file) => !SERVED_EXTENSIONS.has(path.extname(file).toLowerCase()),
    );
    expect(unexpected).toEqual([]);
  });

  test("serves the speculation rules as a prefetch-only rule set", () => {
    const rules: unknown = JSON.parse(
      readFileSync(path.join(publicDirectory, "speculation-rules.json"), "utf8"),
    );
    expect(typeof rules === "object" && rules !== null ? Object.keys(rules) : []).toEqual([
      "prefetch",
    ]);
    expect(siteConf).toContain(`add_header Speculation-Rules '"/speculation-rules.json"' always;`);
    expect(siteConf).toContain("types { application/speculationrules+json json; }");
  });
});
