import { expect, test, type Page } from "@playwright/test";

const INSTALL = "curl -fsSL https://emet.andryore.dev/install.sh | sh";
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

/**
 * Scrolls the pinned runway to a progress between 0 and 1.
 */
async function scrollRunway(page: Page, amount: number): Promise<void> {
  await page.evaluate((progress) => {
    const runway = document.querySelector("[data-how-pin]");
    if (runway === null) throw new Error("missing runway");
    const rect = runway.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    window.scrollTo({ top: rect.top + window.scrollY + progress * travel, behavior: "instant" });
  }, amount);
}

for (const viewport of VIEWPORTS) {
  test.describe(`home code blocks at ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
    });

    test("the install command is fully visible and copies the exact string", async ({
      context,
      page,
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const block = page.locator("#install [data-home-code]");
      await block.scrollIntoViewIfNeeded();
      await expect(block).toContainText(INSTALL);
      const overflow = await page.evaluate(() => {
        const element = document.querySelector("#install [data-home-code] pre");
        return element === null ? null : element.scrollWidth - element.clientWidth;
      });
      expect(overflow).not.toBeNull();
      expect(overflow ?? 1).toBeLessThanOrEqual(0);
      await block.locator("[data-home-code-copy]").click();
      await expect(block.locator("[data-home-code-copy]")).toHaveAttribute("data-copied", "true");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INSTALL);
    });

    test("the closing command is the same block and copies the same string", async ({
      context,
      page,
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const block = page.locator(".closing [data-home-code]");
      await block.scrollIntoViewIfNeeded();
      await expect(block).toContainText(INSTALL);
      await expect(page.locator(".closing .button")).toHaveCount(0);
      await block.locator("[data-home-code-copy]").click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INSTALL);
    });
  });
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  test(`Watch it land is one five-line panel above the viewport bottom at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(size);
    await page.goto("/");
    await scrollRunway(page, 0.95);
    const lines = page.locator(".step").nth(2).locator("[data-terminal-line]");
    await expect(lines).toHaveCount(5);
    await expect(lines.last()).toBeVisible();
    const bottom = await lines.last().evaluate((line) => line.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(size.height);
    await expect(page.locator(".step").nth(0).locator(".install-more")).toBeHidden();
  });
}
