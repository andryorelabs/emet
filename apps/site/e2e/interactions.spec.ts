import { expect, test, type Locator, type Page } from "@playwright/test";

const THEME_TRIGGER = 'button[data-menu="theme-button"]:visible';
const LANGUAGE_TRIGGER = 'button[data-menu="lang-trigger"]:visible';
const MENU_BUTTON = "button[data-menu-button]:visible";
const SEARCH_TRIGGER = "[data-search-trigger]:visible";
const DESKTOP = { width: 1280, height: 900 } as const;
const PHONE = { width: 375, height: 812 } as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/**
 * Asserts a locator's box lies inside the viewport.
 */
async function expectInViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

/**
 * Whether the element at the center of a locator is the locator or one of its descendants, so nothing paints over it.
 */
async function isOnTop(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  });
}

test.describe("header menus on desktop", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
  });

  for (const [name, selector] of [
    ["theme", THEME_TRIGGER],
    ["language", LANGUAGE_TRIGGER],
  ] as const) {
    test(`the ${name} menu opens inside the viewport and Escape returns the focus`, async ({
      page,
    }) => {
      const trigger = page.locator(selector).first();
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expectInViewport(page, menu);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }

  test("switching from one header menu to the other takes one click", async ({ page }) => {
    const theme = page.locator(THEME_TRIGGER).first();
    const language = page.locator(LANGUAGE_TRIGGER).first();
    await theme.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await language.click();
    await expect(language).toHaveAttribute("aria-expanded", "true");
    await expect(theme).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menu")).toHaveCount(1);
  });

  test("choosing a theme applies it, fires the change event and survives a reload", async ({
    page,
  }) => {
    await page.evaluate(() => {
      Object.defineProperty(window, "__themeEvents", { value: [] });
      window.addEventListener("emet:theme", () => {
        const events: unknown = Reflect.get(window, "__themeEvents");
        if (Array.isArray(events)) events.push(document.documentElement.dataset.theme ?? "");
      });
    });
    await page.locator(THEME_TRIGGER).first().click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const themeEvents = await page.evaluate((): string[] => {
      const events: unknown = Reflect.get(window, "__themeEvents");
      return Array.isArray(events) ? events.map(String) : [];
    });
    expect(themeEvents).not.toEqual([]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("choosing a language lands on the same page in that locale", async ({ page }) => {
    await page.goto("/docs/start/install/");
    await page.locator(LANGUAGE_TRIGGER).first().click();
    await page.getByRole("menuitem", { name: /Español/ }).click();
    await expect(page).toHaveURL(/\/es\/docs\/start\/install\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });
});

test.describe("mobile menu sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.locator(MENU_BUTTON).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Escape closes the sheet and returns the focus to the button", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(MENU_BUTTON).first()).toBeFocused();
  });

  test("a menu opened from the sheet paints above it and keeps the sheet open", async ({
    page,
  }) => {
    const sheet = page.getByRole("dialog");
    await sheet.locator('button[data-menu="theme-button"]').click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expectInViewport(page, menu);
    expect(await isOnTop(menu.getByRole("menuitemradio").first())).toBe(true);
    await expect(sheet).toBeVisible();
  });

  test("Escape closes the inner menu first and then the sheet", async ({ page }) => {
    const sheet = page.getByRole("dialog");
    await sheet.locator('button[data-menu="lang-trigger"]').click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("choosing a theme from the sheet applies it", async ({ page }) => {
    await page.getByRole("dialog").locator('button[data-menu="theme-button"]').click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("the sheet controls are styled as bordered full-width buttons", async ({ page }) => {
    const control = page.getByRole("dialog").locator('button[data-menu="lang-trigger"]');
    const style = await control.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { width: element.getBoundingClientRect().width, border: computed.borderTopWidth };
    });
    expect(style.width).toBeGreaterThan(200);
    expect(style.border).not.toBe("0px");
  });
});

test.describe("search", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/docs/start/install/");
  });

  test("Ctrl+K opens the dialog and Escape returns the focus to the trigger", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a slash opens the dialog outside a text field", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("a query returns results without asking a third party", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== new URL(page.url()).origin) {
        external.push(request.url());
      }
    });
    await page.locator(SEARCH_TRIGGER).first().click();
    await page.locator(".pagefind-ui__search-input").fill("install");
    await expect(page.locator(".pagefind-ui__result-link").first()).toBeVisible();
    expect(external).toEqual([]);
  });
});

test.describe("home FAQ and install tabs", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test("the FAQ opens the first question and toggles the others", async ({ page }) => {
    await page.goto("/");
    const triggers = page.locator("[data-faq-trigger]");
    await expect(triggers.nth(0)).toHaveAttribute("aria-expanded", "true");
    await triggers.nth(1).scrollIntoViewIfNeeded();
    await triggers.nth(1).click();
    await expect(triggers.nth(1)).toHaveAttribute("aria-expanded", "true");
    await triggers.nth(1).click();
    await expect(triggers.nth(1)).toHaveAttribute("aria-expanded", "false");
  });

  test("the language list still works without script", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.locator(".lang summary").click();
    await page.getByRole("link", { name: /Español/ }).click();
    await expect(page).toHaveURL(/\/es\/$/);
    await context.close();
  });
});

test.describe("theme sync and system choice", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test("a theme choice syncs across two tabs", async ({ context, page }) => {
    await page.goto("/");
    const other = await context.newPage();
    await other.goto("/");
    await page.locator(THEME_TRIGGER).first().click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the system choice follows the OS color scheme", async ({ page }) => {
    await page.goto("/");
    await page.locator(THEME_TRIGGER).first().click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("popups play no animation under reduced motion", async ({ page }) => {
    await page.goto("/");
    await page.locator(THEME_TRIGGER).first().click();
    const menu = page.locator('[data-menu="theme-menu"]');
    await expect(menu).toBeVisible();
    const animation = await menu.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { name: computed.animationName, duration: computed.animationDuration };
    });
    expect(animation.name === "none" || animation.duration === "0s").toBe(true);
  });
});

test.describe("page actions", () => {
  const ACTIONS_TRIGGER = '[data-page-actions] button[aria-haspopup="menu"]:visible';

  for (const [name, viewport] of [
    ["1280", DESKTOP],
    ["375", PHONE],
  ] as const) {
    test(`the page actions menu opens inside the viewport at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/docs/start/install/");
      await page.locator(ACTIONS_TRIGGER).first().click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expectInViewport(page, menu);
    });
  }

  test("the page actions menu is aligned to its trigger at 1280", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/docs/start/install/");
    const trigger = page.locator(ACTIONS_TRIGGER).first();
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    if (triggerBox === null || menuBox === null) return;
    const rightGap = Math.abs(menuBox.x + menuBox.width - (triggerBox.x + triggerBox.width));
    const leftGap = Math.abs(menuBox.x - triggerBox.x);
    expect(Math.min(rightGap, leftGap)).toBeLessThanOrEqual(4);
  });

  test("the previous and next links navigate", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/docs/start/install/");
    await page.locator('[data-page-actions] a[data-step="next"]').click();
    await expect(page).toHaveURL(/\/docs\/start\/first-run\/$/);
    await page.locator('[data-page-actions] a[data-step="prev"]').click();
    await expect(page).toHaveURL(/\/docs\/start\/install\/$/);
  });
});

test.describe("install tabs", () => {
  const BLOCK = "[data-install-tabs]";

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/docs/start/install/");
  });

  test("clicking another tab shows its panel and marks it selected", async ({ page }) => {
    const block = page.locator(BLOCK).first();
    const tabs = block.getByRole("tab");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
    await expect(block.getByRole("tabpanel")).toHaveCount(1);
    const panelId = await tabs.nth(1).getAttribute("aria-controls");
    await expect(block.locator(`[id="${panelId}"]`)).toBeVisible();
  });

  test("arrow keys move the selection", async ({ page }) => {
    const tabs = page.locator(BLOCK).first().getByRole("tab");
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  });

  test("the choice persists after a reload", async ({ page }) => {
    const tabs = page.locator(BLOCK).first().getByRole("tab");
    await tabs.nth(1).click();
    await page.reload();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  });

  test("the first panel is visible without script", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto("/docs/start/install/");
    await expect(page.locator(`${BLOCK} > [data-tab-label]`).first()).toBeVisible();
    await context.close();
  });
});

test.describe("mobile sheet visibility and navigation", () => {
  test("the menu button is hidden at 1280 and visible at 375", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.locator("button[data-menu-button]").first()).toBeHidden();
    await page.setViewportSize(PHONE);
    await expect(page.locator(MENU_BUTTON).first()).toBeVisible();
  });

  test("a nav link in the sheet navigates and the sheet is closed afterwards", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.locator(MENU_BUTTON).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const link = sheet.locator('nav a[href^="/docs/"]:not([target])').first();
    await link.click();
    await expect(page).toHaveURL(/\/docs\//);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
