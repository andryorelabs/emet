import { expect, test } from "@playwright/test";

test.describe("home sections", () => {
  test("bento fills the content width and Approval matches Review height", async ({ page }) => {
    await page.setViewportSize({ width: 1980, height: 1080 });
    await page.goto("/");
    const bento = page.locator(".bento");
    await bento.scrollIntoViewIfNeeded();
    const edges = await page.evaluate(() => {
      const bentoBox = document.querySelector(".bento")?.getBoundingClientRect();
      const statsBox = document.querySelector(".stats")?.getBoundingClientRect();
      const approval = document.querySelector(".bento-approval")?.getBoundingClientRect();
      const review = document.querySelector(".bento-review")?.getBoundingClientRect();
      const statsElement = document.querySelector(".stats");
      const paddingRight = statsElement
        ? Number.parseFloat(getComputedStyle(statsElement).paddingRight)
        : 0;
      return {
        bentoRight: bentoBox?.right ?? 0,
        statsContentRight: (statsBox?.right ?? 0) - paddingRight,
        approvalHeight: approval?.height ?? 0,
        reviewHeight: review?.height ?? 1,
      };
    });
    expect(Math.abs(edges.bentoRight - edges.statsContentRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.approvalHeight - edges.reviewHeight)).toBeLessThanOrEqual(1);
  });

  for (const width of [1980, 1440, 1024]) {
    test(`the Tracker takes 4 columns and the compact cards fill the rest at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.locator(".bento-tracker").scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const bento = document.querySelector(".bento")?.getBoundingClientRect();
        const tracker = document.querySelector(".bento-tracker")?.getBoundingClientRect();
        const flags = document.querySelector(".bento-flags")?.getBoundingClientRect();
        const compact = document.querySelector(".feature-rows")?.getBoundingClientRect();
        const rights = [...document.querySelectorAll(".feature-row")].map(
          (row) => row.getBoundingClientRect().right,
        );
        return {
          bentoRight: bento?.right ?? 0,
          trackerWidth: tracker?.width ?? 0,
          flagsWidth: flags?.width ?? 1,
          trackerHeight: tracker?.height ?? 0,
          compactHeight: compact?.height ?? 0,
          rights,
        };
      });
      if (width > 1100) {
        expect(Math.abs(layout.trackerWidth - layout.flagsWidth)).toBeLessThanOrEqual(1);
      } else {
        expect(layout.trackerWidth).toBeGreaterThan(layout.flagsWidth);
      }
      expect(Math.abs(layout.trackerHeight - layout.compactHeight)).toBeLessThanOrEqual(24);
      expect(layout.rights).toHaveLength(5);
      expect(Math.max(...layout.rights)).toBeCloseTo(layout.bentoRight, 0);
      for (const right of layout.rights.slice(0, 4)) {
        expect(right).toBeLessThanOrEqual(layout.bentoRight + 1);
      }
    });
  }

  test("the Tracker tabs do not change the Tracker block height", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const tracker = page.locator(".bento-tracker");
    await tracker.scrollIntoViewIfNeeded();
    const tabs = tracker.locator(".tracker-chip");
    const count = await tabs.count();
    expect(count).toBe(3);
    const heights: number[] = [];
    for (let index = 0; index < count; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each tab must be clicked and measured in order
      await tabs.nth(index).click({ force: true });
      // oxlint-disable-next-line eslint/no-await-in-loop -- measured after the click above
      const height = await page.evaluate(
        () => document.querySelector(".feature-rows")?.getBoundingClientRect().height ?? 0,
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- measured after the click above
      const trackerHeight = (await tracker.boundingBox())?.height ?? 0;
      heights.push(Math.round(height), Math.round(trackerHeight));
    }
    expect(new Set(heights.filter((_, index) => index % 2 === 0)).size).toBe(1);
    expect(new Set(heights.filter((_, index) => index % 2 === 1)).size).toBe(1);
  });

  test("the five compact feature cards link to published docs pages", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page
      .locator(".feature-link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(hrefs).toHaveLength(5);
    const responses = await Promise.all(hrefs.map((href) => request.get(href)));
    expect(responses.map((response) => response.ok())).toEqual(hrefs.map(() => true));
  });

  test("the About eyes canvas is displayed after the reveal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".portrait-frame").scrollIntoViewIfNeeded();
    await page.waitForSelector('canvas[data-pixel-reveal][data-state="done"]', {
      state: "attached",
      timeout: 15_000,
    });
    const displays = await page
      .locator(".portrait-frame canvas")
      .evaluateAll((canvases) => canvases.map((canvas) => getComputedStyle(canvas).display));
    expect(displays.some((display) => display !== "none")).toBe(true);
    const eyes = page.locator(".portrait-frame canvas:not([data-pixel-reveal])");
    const visible = eyes.filter({ visible: true });
    await expect(visible).toHaveCount(1);
    const box = await visible.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  });

  test("the About eyes canvas keeps painting new frames over time", async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.locator(".portrait-frame").scrollIntoViewIfNeeded();
    await page.waitForSelector('canvas[data-pixel-reveal][data-state="done"]', {
      state: "attached",
      timeout: 15_000,
    });
    const eyes = page.locator(".portrait-frame canvas:not([data-pixel-reveal])").filter({
      visible: true,
    });
    await expect(eyes).toHaveCount(1);
    const first = (await eyes.screenshot()).toString("base64");
    await expect
      .poll(async () => (await eyes.screenshot()).toString("base64") !== first, {
        intervals: [250],
        timeout: 20_000,
      })
      .toBe(true);
  });
});
