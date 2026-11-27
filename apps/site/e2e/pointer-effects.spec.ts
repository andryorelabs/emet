import { expect, test, type Page } from "@playwright/test";

const WIDE = { width: 1440, height: 900 } as const;
const LETTER = ".hero-letter";

/**
 * Opens the home page at the wide viewport with the motion preference given.
 */
async function openHome(page: Page, motion: "reduce" | "no-preference"): Promise<void> {
  await page.emulateMedia({ reducedMotion: motion });
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeAttached();
}

test.describe("home hero pointer reactions", () => {
  test("a headline letter under the pointer tints toward amber", async ({ page }) => {
    await openHome(page, "no-preference");
    const box = await page.locator("[data-letters]").first().boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator(LETTER).first()).toBeAttached();
    await expect
      .poll(() =>
        page
          .locator(LETTER)
          .evaluateAll((letters) =>
            Math.max(
              ...letters.map((letter) => Number(letter.style.getPropertyValue("--k") || "0")),
            ),
          ),
      )
      .toBeGreaterThan(0.5);
  });

  test("no letter changes under reduced motion", async ({ page }) => {
    await openHome(page, "reduce");
    const box = await page.locator("[data-letters]").first().boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator(LETTER)).toHaveCount(0);
  });

  test("a golem click adds a ring that scales from 1 to 7 over 0.9 s", async ({ page }) => {
    await openHome(page, "no-preference");
    const golem = page.locator("[data-hero-golem]");
    await expect(golem).toBeVisible();
    await golem.dispatchEvent("click");
    const ring = await page.evaluate(() => {
      const found = document.getAnimations().find((animation) => {
        const effect = animation.effect;
        return (
          effect instanceof KeyframeEffect &&
          effect
            .getKeyframes()
            .some((frame) => String(Reflect.get(frame, "transform")) === "scale(7)")
        );
      });
      const effect = found?.effect;
      if (!(effect instanceof KeyframeEffect)) return null;
      return {
        duration: Number(effect.getTiming().duration),
        frames: effect.getKeyframes().map((frame) => String(Reflect.get(frame, "transform"))),
      };
    });
    expect(ring).toEqual({ duration: 900, frames: ["scale(1)", "scale(7)"] });
  });
});

test.describe("home companion idle sleep", () => {
  test("falls asleep after 20 s without input and wakes on a pointer move", async ({ page }) => {
    await page.clock.install();
    await openHome(page, "no-preference");
    await page.evaluate(() => {
      window.scrollTo({ top: window.innerHeight * 2, behavior: "instant" });
    });
    const companion = page.locator("[data-companion]");
    await expect(companion).not.toHaveAttribute("data-away", /.*/);
    await page.clock.runFor(19_000);
    await expect(companion).not.toHaveAttribute("data-state", "sleep");
    await page.clock.runFor(1_500);
    await expect(companion).toHaveAttribute("data-state", "sleep");
    await page.mouse.move(200, 200);
    await expect(companion).not.toHaveAttribute("data-state", "sleep");
  });
});
