import { describe, expect, test } from "bun:test";
import path from "node:path";

const header = await Bun.file(path.join(import.meta.dir, "SiteHeader.astro")).text();
const navStart = header.indexOf("<nav");
const navEnd = header.indexOf("</nav>");
const navMarkup = header.slice(navStart, navEnd);
const branchSplit = navMarkup.indexOf(") : (");
const homeNav = navMarkup.slice(0, branchSplit);
const otherNav = navMarkup.slice(branchSplit);

describe("SiteHeader link sets", () => {
  test("the home mobile menu links omit What's new", () => {
    expect(header).toContain('const isHome = variant === "home";');
    expect(header).toContain("...(isHome ? [] : [");
    expect(header).toContain("{ href: githubUrl, label: strings.github");
  });

  test("home renders only Docs in the nav", () => {
    expect(homeNav).toContain("{strings.docs}");
    expect(homeNav).not.toContain("whatsNewPath");
    expect(homeNav).not.toContain("github-pill");
  });

  test("docs and flow keep What's new and the pill inside the nav", () => {
    expect(otherNav).toContain("{strings.whatsNew}");
    expect(otherNav).toContain("github-pill");
  });
});

describe("SiteHeader GitHub pill position on home", () => {
  test("the pill sits in the end group between search and the theme button", () => {
    const end = header.slice(header.indexOf('<div class="site-header-end">'));
    const search = end.indexOf('<slot name="search" />');
    const pill = end.indexOf("github-pill");
    const theme = end.indexOf("<ThemeSelect");
    expect(search).toBeGreaterThan(-1);
    expect(pill).toBeGreaterThan(search);
    expect(theme).toBeGreaterThan(pill);
  });
});

describe("SiteHeader home inset", () => {
  test("uses the prototype inset and keeps the docs header padding", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "../../styles/site.css")).text();
    const home = css.slice(css.indexOf(".site-header--home {\n  position: absolute;"));
    expect(home).toContain("calc(max(16px, env(safe-area-inset-left, 0px)) + 16px)");
    expect(home).toContain("justify-self: end;");
    expect(css).toContain(
      "padding: 20px max(var(--gutter, 32px), (100% - var(--container, 1280px)) / 2);",
    );
  });
});

describe("SiteHeader home grid", () => {
  test("has one column track per direct child above 900px", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "../../styles/site.css")).text();
    const rule = css.slice(css.indexOf(".site-header--home {\n  position: absolute;"));
    const tracks = /grid-template-columns:\s*([^;]+);/.exec(rule)?.[1] ?? "";
    expect(tracks.trim().split(/\s+/)).toHaveLength(3);
  });
});
