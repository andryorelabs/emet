import { expect, test, type Page } from "@playwright/test";

test.afterEach(({ page }, testInfo) => {
  void page;
  if (testInfo.status === testInfo.expectedStatus) return;
  for (const error of testInfo.errors) {
    process.stdout.write(
      `DOCS-SWEEP-FAILURE ${testInfo.title}: ${(error.message ?? "").slice(0, 700)}\n`,
    );
  }
});

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
              frameFits: node.getBoundingClientRect().right <= window.innerWidth,
            })),
        );
        for (const code of codeOverflow) {
          expect(code.frameFits).toBe(true);
          expect(code.overflowing).toBe(false);
        }

        if (docsPage.name === "install") {
          const tops = await page
            .locator('.emet-install-tabs [data-slot="tabs-trigger"]:visible')
            .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
          expect(tops.length).toBeGreaterThanOrEqual(2);
          expect(new Set(tops.map((top) => Math.round(top))).size).toBe(1);
        }

        if (viewport.width === 390) {
          const menuButtons = await page.evaluate(() =>
            [...document.querySelectorAll("button[data-menu-button], .sl-menu-button")]
              .filter((candidate) => candidate.getClientRects().length > 0)
              .map((candidate) => candidate.className),
          );
          expect(menuButtons).toHaveLength(1);
          expect(menuButtons.join(" ")).not.toContain("sl-menu-button");

          const overlaps = await page.evaluate(() => {
            const menu = [...document.querySelectorAll("button[data-menu-button]")].find(
              (candidate) => candidate.getClientRects().length > 0,
            );
            const menuBox = menu?.getBoundingClientRect();
            const neighbours = [
              ...document.querySelectorAll(
                '.docs-header button, .docs-header summary, .docs-header a[href], [data-menu="lang-trigger"]',
              ),
            ].filter((node) => node !== menu && node.getClientRects().length > 0);
            return {
              neighbours: neighbours.length,
              hasMenu: menuBox !== undefined,
              overlapping: neighbours.filter((node) => {
                const box = node.getBoundingClientRect();
                return (
                  menuBox !== undefined &&
                  box.left < menuBox.right &&
                  menuBox.left < box.right &&
                  box.top < menuBox.bottom &&
                  menuBox.top < box.bottom
                );
              }).length,
            };
          });
          expect(overlaps.hasMenu).toBe(true);
          expect(overlaps.neighbours).toBeGreaterThan(0);
          expect(overlaps.overlapping).toBe(0);
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
    const read = async (): Promise<{
      borders: string[];
      alphas: number[];
      background: string;
      prefersDark: boolean;
    }> => {
      const [borders, alphas] = await links.evaluateAll((nodes) => {
        const styles = nodes.map((node) => getComputedStyle(node));
        return [
          styles.map((s) => `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`),
          styles.map((s) => {
            const match = /(?:,|\/)\s*([\d.]+)\s*\)$/.exec(s.borderTopColor);
            return match?.[1] === undefined ? 1 : Number(match[1]);
          }),
        ] as const;
      });
      return {
        borders,
        alphas,
        background: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
        prefersDark: await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches),
      };
    };
    const backgrounds: string[] = [];
    for (const colorScheme of ["light", "dark"] as const) {
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each scheme re-renders the same page */
      await page.emulateMedia({ colorScheme });
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: reads the scheme just applied */
      const state = await read();
      expect(state.prefersDark).toBe(colorScheme === "dark");
      expect(state.borders[0]).toBe(state.borders[1]);
      expect(state.borders[0]).toMatch(/^[1-9]\d*(\.\d+)?px solid /);
      for (const alpha of state.alphas) expect(alpha).toBeGreaterThan(0);
      backgrounds.push(state.background);
    }
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
  });
}
