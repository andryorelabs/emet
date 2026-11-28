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

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the previous and next links use the text color in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize(DESKTOP);
      await page.goto("/docs/start/install/");
      const colors = await page.evaluate(() => {
        const step = document.querySelector('[data-page-actions] a[data-step="next"]');
        const heading = document.querySelector("h1");
        return {
          step: step === null ? "" : getComputedStyle(step).color,
          heading: heading === null ? "" : getComputedStyle(heading).color,
        };
      });
      expect(colors.step).not.toBe("");
      expect(colors.step).toBe(colors.heading);
    });
  }
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

  test("a nav link in the sheet navigates to the docs", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.locator(MENU_BUTTON).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.locator('nav a[href^="/docs/"]:not([target])').first().click();
    await expect(page).toHaveURL(/\/docs\//);
  });

  test("clicking a nav link closes the sheet on the same page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    const menuButton = page.locator(MENU_BUTTON).first();
    await menuButton.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
        },
        { capture: true },
      );
    });
    await sheet.locator('nav a[href^="/docs/"]:not([target])').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });
});

const WIDE = { width: 1440, height: 900 } as const;
const NARROW = { width: 390, height: 844 } as const;

/**
 * Opens a home page with the motion preference given.
 */
async function openHome(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
  motion: "reduce" | "no-preference",
  path = "/",
): Promise<void> {
  await page.emulateMedia({ reducedMotion: motion });
  await page.setViewportSize(viewport);
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeAttached();
}

/**
 * Scrolls the window so a runway sits at `progress` of its pinned travel.
 */
async function scrollRunway(page: Page, selector: string, progress: number): Promise<void> {
  await page.evaluate(
    ({ target, amount }) => {
      const runway = document.querySelector(target);
      if (runway === null) throw new Error(`missing ${target}`);
      const rect = runway.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      window.scrollTo({
        top: rect.top + window.scrollY + amount * travel,
        behavior: "instant",
      });
    },
    { target: selector, amount: progress },
  );
}

/**
 * Whether the page scrolls sideways.
 */
async function overflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe("home How it works runway", () => {
  test("pins at 1440 and the steps change at about 30% and 62%", async ({ page }) => {
    await openHome(page, WIDE, "no-preference");
    const runway = page.locator("[data-how-pin]");
    await expect(runway).toHaveAttribute("data-pinned", "true");
    const height = await runway.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(WIDE.height * 3.5);
    for (const [progress, step] of [
      [0.1, "0"],
      [0.45, "1"],
      [0.85, "2"],
    ] as const) {
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
      await scrollRunway(page, "[data-how-pin]", progress);
      /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
      await expect(runway).toHaveAttribute("data-step", step);
    }
    await expect(runway.locator(".step").nth(2)).toHaveAttribute("data-step-state", "on");
    await expect(runway.locator(".step").nth(0)).toHaveAttribute("data-step-state", "done");
    await expect(runway.locator("[data-streams]").first()).toHaveAttribute("data-stage", "2");
  });

  test("the host switch labels Claude Code and Codex and copies the active command", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openHome(page, WIDE, "reduce");
    const hosts = page.locator("[data-how-pin] [data-home-host-tabs]");
    const tabs = hosts.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText("Claude Code");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await hosts.scrollIntoViewIfNeeded();
    await hosts.locator("[data-home-code-copy]").click();
    await expect(hosts.locator("[data-home-code-copy]")).toHaveAttribute("data-copied", "true");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\/emet:run /);
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(hosts.locator("[data-home-code-copy]")).not.toHaveAttribute("data-copied", "true");
    await hosts.locator("[data-home-code-copy]").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\$emet:run /);
  });

  test("stacks all three steps at 390 with no pin and no sideways scroll", async ({ page }) => {
    await openHome(page, NARROW, "no-preference");
    const runway = page.locator("[data-how-pin]");
    await expect(runway).not.toHaveAttribute("data-pinned", /.*/);
    await expect(runway.locator(".step")).toHaveCount(3);
    await expect(runway.locator(".step[data-step-state]")).toHaveCount(0);
    await runway.scrollIntoViewIfNeeded();
    expect(await overflowsHorizontally(page)).toBe(false);
  });

  test("shows the stacked final state at 1440 under reduced motion", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    const runway = page.locator("[data-how-pin]");
    await expect(runway).not.toHaveAttribute("data-pinned", /.*/);
    const height = await runway.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeLessThan(WIDE.height * 3.5);
    await expect(runway.locator(".step .step-inner").last()).toBeAttached();
  });
});

test.describe("home bento interactions", () => {
  test.beforeEach(async ({ page }) => {
    await openHome(page, WIDE, "reduce");
  });

  test("holding the approval button for 0.9 s stamps and announces it", async ({ page }) => {
    const scene = page.locator('[data-interact="approval"]');
    const button = scene.locator(".approval-button");
    await button.scrollIntoViewIfNeeded();
    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(scene).toHaveAttribute("data-done", "");
    await expect(scene.locator(".approval-status")).not.toBeEmpty();
  });

  test("releasing the approval button early approves nothing", async ({ page }) => {
    const scene = page.locator('[data-interact="approval"]');
    const button = scene.locator(".approval-button");
    await button.scrollIntoViewIfNeeded();
    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(800);
    await expect(scene).not.toHaveAttribute("data-done", /.*/);
    await expect(scene.locator(".approval-status")).toBeEmpty();
  });

  test("the features flag toggle holds the wave and releases it", async ({ page }) => {
    const scene = page.locator('[data-interact="flags"]');
    const toggle = scene.locator(".flags-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(scene).toHaveAttribute("data-held", "");
    await expect(scene.locator(".flags-caption")).not.toBeEmpty();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(scene.locator(".flags-caption")).toBeEmpty();
  });
});

test.describe("home showcase", () => {
  test("pins at 1440, auto-flags past 74% and stops auto-flagging after a click", async ({
    page,
  }) => {
    await openHome(page, WIDE, "no-preference");
    const showcase = page.locator("[data-showcase]");
    const flag = showcase.locator("[data-showcase-flag]");
    await expect(showcase).toHaveAttribute("data-pinned", /.*/);
    await scrollRunway(page, "[data-showcase]", 0.3);
    await expect(flag).toHaveAttribute("aria-pressed", "false");
    await scrollRunway(page, "[data-showcase]", 0.9);
    await expect(flag).toHaveAttribute("aria-pressed", "true");
    await expect(showcase).toHaveAttribute("data-state", "held");
    await flag.click();
    await expect(flag).toHaveAttribute("aria-pressed", "false");
    await scrollRunway(page, "[data-showcase]", 0.95);
    await page.waitForTimeout(400);
    await expect(flag).toHaveAttribute("aria-pressed", "false");
  });

  test("stacks with the switch usable at 390 and no sideways scroll", async ({ page }) => {
    await openHome(page, NARROW, "no-preference");
    const showcase = page.locator("[data-showcase]");
    await expect(showcase).not.toHaveAttribute("data-pinned", /.*/);
    const flag = showcase.locator("[data-showcase-flag]");
    await flag.scrollIntoViewIfNeeded();
    await flag.click();
    await expect(flag).toHaveAttribute("aria-pressed", "true");
    expect(await overflowsHorizontally(page)).toBe(false);
  });

  test("shows the stacked final state under reduced motion at 1440", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    const showcase = page.locator("[data-showcase]");
    await expect(showcase).not.toHaveAttribute("data-pinned", /.*/);
    await expect(showcase.locator("[data-showcase-lanes]")).toBeAttached();
    expect(await overflowsHorizontally(page)).toBe(false);
  });
});

test.describe("home closing", () => {
  test("copies the exact install command", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openHome(page, WIDE, "reduce");
    const copy = page.locator(".closing [data-home-code-copy]");
    await copy.scrollIntoViewIfNeeded();
    await copy.click();
    await expect(copy).toHaveAttribute("data-copied", "true");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "curl -fsSL https://emet.andryore.dev/install.sh | sh",
    );
  });
});

test.describe("home companion", () => {
  const COMPANION = "[data-companion]";
  const BUTTON = "[data-companion-button]";
  const MENU = "[data-companion-menu]";

  /**
   * Scrolls past the hero so the companion wakes.
   */
  async function wakeCompanion(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.scrollTo({ top: window.innerHeight * 2, behavior: "instant" });
    });
    await expect(page.locator(COMPANION)).not.toHaveAttribute("data-away", /.*/);
  }

  /**
   * Reads one inline custom property of the companion.
   */
  async function companionProperty(page: Page, name: string): Promise<string> {
    return page
      .locator(COMPANION)
      .evaluate((element, property) => element.style.getPropertyValue(property), name);
  }

  test("stays away over the hero", async ({ page }) => {
    await openHome(page, WIDE, "no-preference");
    await expect(page.locator(COMPANION)).toHaveAttribute("data-away", "");
  });

  test("opens a four-question menu and Escape closes it returning the focus", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    await wakeCompanion(page);
    const button = page.locator(BUTTON);
    await button.click();
    await expect(page.locator(MENU).getByRole("menuitem")).toHaveCount(4);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(MENU)).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("arrow keys move through the menu and an outside click closes it", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    await wakeCompanion(page);
    await page.locator(BUTTON).click();
    const items = page.locator(MENU).getByRole("menuitem");
    await items.nth(0).focus();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.mouse.click(40, 300);
    await expect(page.locator(MENU)).toBeHidden();
  });

  test("choosing a question shows its fixed answer", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    await wakeCompanion(page);
    await page.locator(BUTTON).click();
    const first = page.locator(MENU).getByRole("menuitem").first();
    const answer = await first.getAttribute("data-answer");
    await first.click();
    await expect(page.locator("[data-companion-say]")).toHaveText(answer ?? "");
  });

  test("drags with the pointer and springs back on release without opening the menu", async ({
    page,
  }) => {
    await openHome(page, WIDE, "no-preference");
    await wakeCompanion(page);
    const button = page.locator(BUTTON);
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 80, centerY - 60, { steps: 6 });
    await expect.poll(() => companionProperty(page, "--companion-dx")).not.toBe("");
    expect(await companionProperty(page, "--companion-dx")).not.toBe("0px");
    await page.mouse.up();
    await expect(page.locator(COMPANION)).toHaveAttribute("data-back", "");
    await expect.poll(() => companionProperty(page, "--companion-dx")).toBe("0px");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("under reduced motion the eyes hold still and dragging moves nothing", async ({ page }) => {
    await openHome(page, WIDE, "reduce");
    await wakeCompanion(page);
    const box = await page.locator(BUTTON).boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 120, centerY - 120, { steps: 6 });
    await page.mouse.up();
    expect(await companionProperty(page, "--eye-x")).toBe("");
    expect(await companionProperty(page, "--companion-dx")).toBe("");
  });

  test("copying a command moves the companion to its done state", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openHome(page, WIDE, "reduce");
    await wakeCompanion(page);
    const copy = page.locator(".closing [data-home-code-copy]");
    await copy.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      document.body.dataset.copyEvents = "0";
      addEventListener("emet:copy", () => {
        document.body.dataset.copyEvents = String(Number(document.body.dataset.copyEvents) + 1);
      });
    });
    await copy.click();
    await expect(page.locator("body")).toHaveAttribute("data-copy-events", "1");
    await expect(page.locator(COMPANION)).toHaveAttribute("data-state", "done");
  });
});

test.describe("home layout at both widths", () => {
  for (const [name, viewport] of [
    ["1440", WIDE],
    ["390", NARROW],
  ] as const) {
    for (const motion of ["reduce", "no-preference"] as const) {
      for (const path of ["/", "/es/"]) {
        test(`${path} has no horizontal scroll at ${name} with ${motion} motion`, async ({
          page,
        }) => {
          await openHome(page, viewport, motion, path);
          expect(await overflowsHorizontally(page)).toBe(false);
          await page.evaluate(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          });
          expect(await overflowsHorizontally(page)).toBe(false);
        });
      }
    }
  }
});

test.describe("home content security policy", () => {
  for (const motion of ["reduce", "no-preference"] as const) {
    test(`a full scroll with ${motion} motion raises no securitypolicyviolation`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const violations: string[] = [];
        Object.defineProperty(window, "__cspViolations", { value: violations });
        document.addEventListener("securitypolicyviolation", (event) => {
          violations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      await openHome(page, WIDE, motion);
      await page.evaluate(async () => {
        const height = document.documentElement.scrollHeight;
        for (let top = 0; top < height; top += 600) {
          window.scrollTo({ top, behavior: "instant" });
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          await new Promise((resolve) => {
            requestAnimationFrame(resolve);
          });
        }
      });
      const violations = await page.evaluate((): string[] => {
        const value: unknown = Reflect.get(window, "__cspViolations");
        return Array.isArray(value) ? value.map(String) : [];
      });
      expect(violations).toEqual([]);
    });
  }
});
