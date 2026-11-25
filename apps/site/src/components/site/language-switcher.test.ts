import { describe, expect, test } from "bun:test";
import path from "node:path";

const switcher = await Bun.file(path.join(import.meta.dir, "LanguageSwitcher.astro")).text();
const menuCss = await Bun.file(path.join(import.meta.dir, "../../styles/header-menus.css")).text();

describe("LanguageSwitcher without script", () => {
  test("keeps a noscript list of plain links to every locale", () => {
    const noscript = switcher.slice(
      switcher.indexOf("<noscript>"),
      switcher.indexOf("</noscript>"),
    );
    expect(noscript).toContain("<details>");
    expect(noscript).toContain("LOCALES.map");
    expect(noscript).toContain("href={localePath(target, currentPath)}");
    expect(noscript).toContain("hreflang={target}");
  });

  test("hides the island and the other script-only header controls when scripting is off", () => {
    expect(menuCss).toMatch(
      /@media \(scripting: none\) \{\s*\.theme-select,\s*\.mobile-menu,\s*\.lang > astro-island \{\s*display: none;/,
    );
  });
});
