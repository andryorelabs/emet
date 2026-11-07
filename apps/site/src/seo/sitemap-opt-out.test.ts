import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sitemapOptOut } from "./sitemap-opt-out";

describe("sitemapOptOut", () => {
  test("holds the integration name Starlight looks for before adding its own sitemap", () => {
    expect(sitemapOptOut.name).toBe("@astrojs/sitemap");
    const starlightEntry = Bun.resolveSync("@astrojs/starlight", import.meta.dir);
    const source = readFileSync(starlightEntry, "utf8");
    expect(source).toMatch(
      /allIntegrations\.find\(\(\{ name \}\) => name === "@astrojs\/sitemap"\)\)\s*integrations\.push\(starlightSitemap/,
    );
  });
});
