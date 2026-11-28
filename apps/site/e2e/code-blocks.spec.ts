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

for (const scheme of ["light", "dark"] as const) {
  test(`the closing command stays readable on its pill in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const block = page.locator(".closing [data-home-code]");
    await block.scrollIntoViewIfNeeded();
    const lightness = async (): Promise<number> =>
      block
        .locator("[data-slot=code-block-line] span")
        .last()
        .evaluate((node) => {
          const [red = 0, green = 0, blue = 0] =
            getComputedStyle(node)
              .color.match(/[\d.]+/g)
              ?.map(Number) ?? [];
          return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
        });
    await expect.poll(lightness, { timeout: 15_000 }).toBeGreaterThan(0.5);
  });
}

for (const size of [
  { width: 1980, height: 1020 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 680 },
]) {
  test(`Watch it land fits the whole terminal panel with a 16px margin at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(size);
    await page.goto("/");
    await scrollRunway(page, 0.95);
    const step = page.locator(".step").nth(2);
    await expect(step.locator("[data-terminal-line]")).toHaveCount(5);
    const panel = step.locator("[data-terminal-animated] pre").locator("xpath=..");
    await expect(panel).toBeVisible();
    const box = async (): Promise<{ top: number; bottom: number }> =>
      panel.evaluate((node) => {
        const { top, bottom } = node.getBoundingClientRect();
        return { top, bottom };
      });
    await expect.poll(async () => (await box()).bottom).toBeLessThanOrEqual(size.height - 16);
    await expect.poll(async () => (await box()).top).toBeGreaterThanOrEqual(0);
    const heading = await page.locator(".how h2").evaluate((node) => {
      const { top, bottom } = node.getBoundingClientRect();
      return { top, bottom, height: window.innerHeight };
    });
    expect(heading.top).toBeGreaterThanOrEqual(0);
    expect(heading.bottom).toBeLessThanOrEqual(heading.height);
    await expect(page.locator(".step").nth(0).locator(".install-more")).toBeHidden();
  });
}
