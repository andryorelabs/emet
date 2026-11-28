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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1980, height: 1080 },
  { width: 390, height: 844 },
] as const) {
  test(`the companion hides at the end of the page at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const companion = page.locator("[data-companion]");
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(companion).toHaveAttribute("data-away", "");
    await expect(companion).toHaveJSProperty("inert", true);
    await expect(companion).toHaveCSS("opacity", "0");
    await expect(companion).toHaveCSS("pointer-events", "none");
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight / 2);
    });
    await expect(companion).not.toHaveAttribute("data-away", "");
  });
}

test("the About reveal canvas fades out before it is hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator(".portrait-frame").scrollIntoViewIfNeeded();
  const canvas = page.locator("canvas[data-pixel-reveal]");
  await expect(canvas).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  const style = await canvas.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { transition: computed.transitionDuration, pointerEvents: computed.pointerEvents };
  });
  expect(style.transition).toBe("0.2s");
  expect(style.pointerEvents).toBe("none");
  await expect(canvas).toHaveJSProperty("hidden", true);
  const display = await canvas.evaluate((node) => getComputedStyle(node).display);
  expect(display).toBe("none");
});

test("the companion hides as soon as the footer enters the viewport and returns above it", async ({
  page,
}) => {
  await page.goto("/");
  const companion = page.locator("[data-companion]");
  const scrollToFooterGap = async (gap: number): Promise<void> => {
    await page.evaluate((distance) => {
      const footer = document.querySelector(".site-footer");
      if (!footer) throw new Error("missing footer");
      window.scrollBy(0, footer.getBoundingClientRect().top - window.innerHeight + distance);
    }, gap);
  };
  await scrollToFooterGap(16);
  await expect(companion).toHaveAttribute("data-away", "");
  await scrollToFooterGap(60);
  await expect(companion).toHaveAttribute("data-away", "");
  await scrollToFooterGap(-8);
  await expect(companion).not.toHaveAttribute("data-away", "");
});
