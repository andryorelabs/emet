import { describe, expect, test } from "bun:test";

import { LOCALES } from "../i18n/locales";
import {
  buildWebManifest,
  homeJsonLd,
  homeJsonLdTag,
  installLinkTags,
  ogImagePath,
  resolveSharePage,
  shareMetaTags,
  splitLocalePath,
} from "./share-meta";

function content(tags: ReturnType<typeof shareMetaTags>, key: string): string | undefined {
  return tags.find((tag) => tag.attrs["property"] === key || tag.attrs["name"] === key)?.attrs[
    "content"
  ];
}

describe("shareMetaTags", () => {
  const tags = shareMetaTags("ja", "/", "Title", "Description");

  test("points og:image at the locale's PNG with an alt text", () => {
    expect(content(tags, "og:image")).toBe("https://emet.andryore.dev/og/og-ja.png");
    expect(content(tags, "twitter:image")).toBe("https://emet.andryore.dev/og/og-ja.png");
    expect(content(tags, "og:image:alt")).toContain("emet");
    expect(content(tags, "og:image:width")).toBe("1200");
    expect(content(tags, "og:image:height")).toBe("630");
  });

  test("carries the page identity and the card type", () => {
    expect(content(tags, "og:url")).toBe("https://emet.andryore.dev/ja/");
    expect(content(tags, "og:title")).toBe("Title");
    expect(content(tags, "og:description")).toBe("Description");
    expect(content(tags, "og:type")).toBe("website");
    expect(content(tags, "og:locale")).toBe("ja_JP");
    expect(content(tags, "twitter:card")).toBe("summary_large_image");
  });

  test("lists every other locale as an alternate", () => {
    const alternates = tags.filter((tag) => tag.attrs["property"] === "og:locale:alternate");
    expect(alternates).toHaveLength(LOCALES.length - 1);
    expect(alternates.map((tag) => tag.attrs["content"])).not.toContain("ja_JP");
  });
});

describe("installLinkTags", () => {
  test("links icons, manifest and llms.txt", () => {
    const hrefs = installLinkTags().map((tag) => tag.attrs["href"]);
    expect(hrefs).toEqual([
      "/favicon.ico",
      "/apple-touch-icon.png",
      "/manifest.webmanifest",
      "/llms.txt",
    ]);
    expect(installLinkTags().at(-1)?.attrs["rel"]).toBe("describedby");
  });
});

describe("homeJsonLdTag", () => {
  test("builds a graph of WebSite, WebPage and author", () => {
    const graph = homeJsonLd("en", "Title", "Description");
    expect(graph["@graph"].map((node) => node["@type"])).toEqual(["WebSite", "WebPage", "Person"]);
  });

  test("serialises into a JSON-LD script tag", () => {
    const tag = homeJsonLdTag("en", "A </script> title", "Description");
    expect(tag.attrs["type"]).toBe("application/ld+json");
    expect(tag.content).not.toContain("</script>");
  });
});

describe("buildWebManifest", () => {
  test("has name, 192 and 512 icons and colors", () => {
    const manifest = buildWebManifest();
    expect(manifest.name).toBe("emet");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("splitLocalePath", () => {
  test("splits the locale prefix off a pathname", () => {
    expect(splitLocalePath("/pt-br/docs/guide/")).toEqual({
      locale: "pt-BR",
      path: "/docs/guide/",
    });
    expect(splitLocalePath("/ja/")).toEqual({ locale: "ja", path: "/" });
    expect(splitLocalePath("/docs/guide/")).toEqual({ locale: "en", path: "/docs/guide/" });
  });
});

describe("ogImagePath", () => {
  test("names the PNG after the locale tag", () => {
    expect(ogImagePath("zh-CN")).toBe("/og/og-zh-CN.png");
  });
});

describe("resolveSharePage", () => {
  test("the 404 page shares its locale's home address", () => {
    expect(resolveSharePage("/404/")).toEqual({ locale: "en", path: "/", isNotFound: true });
    expect(resolveSharePage("/es/404/")).toEqual({ locale: "es", path: "/", isNotFound: true });
  });

  test("other pages keep their path", () => {
    expect(resolveSharePage("/ja/")).toEqual({ locale: "ja", path: "/", isNotFound: false });
    expect(resolveSharePage("/docs/guide/")).toEqual({
      locale: "en",
      path: "/docs/guide/",
      isNotFound: false,
    });
  });
});
