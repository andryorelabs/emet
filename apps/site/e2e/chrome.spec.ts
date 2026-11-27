import { expect, test } from "@playwright/test";

const THEME_TRIGGER = 'button[data-menu="theme-button"]:visible';
const LANGUAGE_TRIGGER = 'button[data-menu="lang-trigger"]:visible';
const DESKTOP = { width: 1440, height: 900 } as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(DESKTOP);
});

for (const [name, trigger] of [
  ["theme", THEME_TRIGGER],
  ["language", LANGUAGE_TRIGGER],
] as const) {
  test(`the ${name} menu does not lock scroll or shift the layout`, async ({ page }) => {
    await page.goto("/");
    const measure = () =>
      page.evaluate(() => ({
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        bodyOverflow: getComputedStyle(document.body).overflow,
        clientWidth: document.documentElement.clientWidth,
        gutter: getComputedStyle(document.documentElement).scrollbarGutter,
      }));
    const before = await measure();
    await page.locator(trigger).click();
    await expect(page.locator(`${trigger}[aria-expanded="true"]`)).toBeVisible();
    const during = await measure();
    expect(during).toEqual(before);
    expect(during.bodyOverflow).toBe("visible");
    expect(during.gutter).toContain("stable");
  });
}

test("the footer shows its legal items on one row with uppercase headings", async ({ page }) => {
  await page.setViewportSize({ width: 1980, height: 1000 });
  await page.goto("/");
  const items = page.locator(".footer-bottom > *");
  await expect(items).toHaveCount(3);
  const tops = await items.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
  const transform = await page
    .locator(".footer-heading")
    .first()
    .evaluate((node) => getComputedStyle(node).textTransform);
  expect(transform).toBe("uppercase");
});

test("the page-actions menu does not lock scroll or shift the layout", async ({ page }) => {
  await page.goto("/docs/guide/fleet/", { waitUntil: "load" });
  const trigger = page.getByRole("button", { name: "More page actions" });
  await expect(trigger).toBeVisible();
  await page.waitForLoadState("networkidle");
  const measure = () =>
    page.evaluate(() => ({
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      clientWidth: document.documentElement.clientWidth,
    }));
  const before = await measure();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await measure()).toEqual(before);
  expect(before.bodyOverflow).toBe("visible");
});
