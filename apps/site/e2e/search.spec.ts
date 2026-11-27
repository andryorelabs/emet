import { expect, test } from "@playwright/test";

const DIALOG = '[data-search-part="dialog"]';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const SCHEMES = ["light", "dark"] as const;

for (const viewport of VIEWPORTS) {
  for (const colorScheme of SCHEMES) {
    test.describe(`search at ${viewport.width}x${viewport.height} in ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });

      test("Ctrl K and `review` show results inside the viewport", async ({ page }) => {
        await page.goto("/docs/", { waitUntil: "networkidle" });
        await page.keyboard.press("Control+k");
        const dialog = page.locator(DIALOG);
        await expect(dialog).toBeVisible();
        await page.keyboard.type("review");
        await expect(page.locator(".pagefind-ui__result").first()).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) return;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-search-part="footer-privacy"]')).toBeInViewport({
          ratio: 1,
        });
      });
    });
  }
}

test("the footer key hint is visible on desktop", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto("/docs/", { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await expect(page.locator('[data-search-part="footer-keys"]')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-search-part="footer-keys"]')).toHaveText(
    "↑↓ to move, Enter to open",
  );
});

test("the search button label has no ellipsis", async ({ page }) => {
  await page.goto("/docs/");
  const label = page.locator(".search-button-label--full").first();
  await expect(label).toHaveText("Search documentation");
});

for (const path of ["/docs/", "/de/docs/"]) {
  test(`the search button label is not cut off on ${path} at 1440x900`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const label = page.locator(".search-button-label--full").first();
    await expect(label).toBeVisible();
    const { scrollWidth, clientWidth } = await label.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test(`the header does not overflow on ${path} at 390x844`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator("[data-search-trigger]").first()).toHaveAccessibleName(/\S/);
  });
}
