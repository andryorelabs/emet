import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["en", "es", "de", "fr", "it", "ja", "ko", "pt-BR", "ru", "zh-CN"] as const;
const PAGES = [
  { name: "install", path: "/docs/start/install/" },
  { name: "how-to", path: "/docs/how-to/check-a-fleet/" },
  { name: "CLI reference", path: "/docs/reference/cli/" },
  { name: "what's new", path: "/docs/whats-new/" },
] as const;
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

/**
 * Site-relative path of a docs page for a locale; English is unprefixed.
 * @param locale - One of the Website's locales.
 * @param path - The English path.
 * @returns The localized path.
 */
function localized(locale: (typeof LOCALES)[number], path: string): string {
  return locale === "en" ? path : `/${locale.toLowerCase()}${path}`;
}

/**
 * Records console errors and failed requests until the returned reader is called.
 * @param page - The page to watch.
 * @returns A function that returns every problem seen so far.
 */
function watchProblems(page: Page): () => string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    problems.push(`failed: ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`);
  });
  return () => problems;
}

for (const viewport of VIEWPORTS) {
  for (const locale of LOCALES) {
    for (const docsPage of PAGES) {
      test(`docs sweep: ${docsPage.name} in ${locale} at ${viewport.name}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const problems = watchProblems(page);
        await page.goto(localized(locale, docsPage.path), { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1").first()).toBeVisible();

        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);

        const labels = await page.evaluate(
          () =>
            [...document.querySelectorAll("[data-language]")].filter(
              (node) => getComputedStyle(node, "::after").content.replaceAll('"', "") !== "none",
            ).length,
        );
        expect(labels).toBe(0);

        const transparentCopyButtons = await page.evaluate(
          () =>
            [...document.querySelectorAll(".expressive-code .frame .copy button")].filter(
              (node) => getComputedStyle(node).backgroundColor === "rgba(0, 0, 0, 0)",
            ).length,
        );
        expect(transparentCopyButtons).toBe(0);

        const codeOverflow = await page.evaluate(() =>
          [...document.querySelectorAll(".emet-install-tabs pre")]
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => ({
              overflowing: node.scrollWidth > node.clientWidth,
              scrolls: ["auto", "scroll"].includes(getComputedStyle(node).overflowX),
              frameFits: node.getBoundingClientRect().right <= window.innerWidth,
            })),
        );
        for (const code of codeOverflow) {
          expect(code.frameFits).toBe(true);
          if (viewport.width > 390) expect(code.overflowing).toBe(false);
          else expect(!code.overflowing || code.scrolls).toBe(true);
        }

        if (docsPage.name === "install") {
          const tops = await page
            .locator('.emet-install-tabs [data-slot="tabs-trigger"]:visible')
            .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
          expect(tops.length).toBeGreaterThanOrEqual(2);
          expect(new Set(tops.map((top) => Math.round(top))).size).toBe(1);
        }

        if (viewport.width === 390) {
          const boxes = await page.evaluate(() => {
            const [menu, language] = [
              "button[data-menu-button], .sl-menu-button",
              '[data-menu="lang-trigger"], .docs-header .lang summary',
            ].map((selector) =>
              [...document.querySelectorAll(selector)]
                .find((candidate) => candidate.getClientRects().length > 0)
                ?.getBoundingClientRect(),
            );
            return { menu: menu ?? null, language: language ?? null };
          });
          expect(boxes.menu).not.toBeNull();
          if (boxes.menu !== null && boxes.language !== null) {
            const apart =
              boxes.menu.right <= boxes.language.left ||
              boxes.language.right <= boxes.menu.left ||
              boxes.menu.bottom <= boxes.language.top ||
              boxes.language.bottom <= boxes.menu.top;
            expect(apart).toBe(true);
          }
        }

        expect(problems()).toEqual([]);
      });
    }
  }

  test(`docs sweep: prev/next borders match in light and dark at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/docs/how-to/check-a-fleet/", { waitUntil: "load" });
    const links = page.locator(".pagination-links a");
    await expect(links).toHaveCount(2);
    const borders = async (): Promise<string[]> =>
      links.evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;
        }),
      );
    for (const colorScheme of ["light", "dark"] as const) {
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each scheme re-renders the same page */
      await page.emulateMedia({ colorScheme });
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: reads the scheme just applied */
      const [previous, next] = await borders();
      expect(previous).toBe(next);
      expect(previous).not.toContain("0px");
    }
  });
}
