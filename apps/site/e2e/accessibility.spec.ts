import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** A key page of the Website, with the HTTP status and `lang` it must serve. */
interface KeyPage {
  readonly name: string;
  readonly path: string;
  readonly status: number;
  readonly lang: string;
}

/** An axe rule waived on the nodes one selector pattern matches, with why. */
interface KnownAxeIssue {
  readonly rule: string;
  readonly target: RegExp;
  readonly reason: string;
}

/** The pages every site change must keep accessible: home, a docs page, the 404 and a translated page. */
const KEY_PAGES: readonly KeyPage[] = [
  { name: "home", path: "/", status: 200, lang: "en" },
  { name: "docs page", path: "/docs/start/install/", status: 200, lang: "en" },
  { name: "404", path: "/nope/", status: 404, lang: "en" },
  { name: "translated page", path: "/es/", status: 200, lang: "es" },
];

/** The axe rule tags the site holds itself to: WCAG 2.2 A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The color schemes the site renders, since its tokens use `light-dark()`. */
const COLOR_SCHEMES = ["light", "dark"] as const;

/**
 * The selector axe gives a Base UI focus guard: a `span` with the guard attribute, optionally typed
 * `inside` or `outside`, as the last compound of the target, so no other node can match.
 */
const BASE_UI_FOCUS_GUARD_TARGET =
  /(?:^|[\s>])span(?:\[data-type="(?:inside|outside)"\])?\[data-base-ui-focus-guard=""\]\[aria-hidden="true"\](?::nth-child\(\d+\))?$/;

/** Each waiver covers one rule on one selector, never a whole page or rule. */
const KNOWN_AXE_ISSUES: readonly KnownAxeIssue[] = [
  {
    rule: "aria-hidden-focus",
    target: BASE_UI_FOCUS_GUARD_TARGET,
    reason:
      "Floating UI and Base UI focus guards are aria-hidden tabindex=0 spans by design: they hand focus straight back to the trigger or the popup. Base UI renders them for every open menu, modal or not, and no prop removes them. axe only downgrades them to incomplete when an overlay covers 75% of the viewport, which a non-modal menu intentionally lacks (S5: no scroll lock, outside clicks reach the page).",
  },
];

/**
 * Records every Content-Security-Policy violation the page reports, as
 * `<directive> <blocked URI>`, so an inline script or style attribute whose
 * hash is missing from the policy fails the spec.
 */
async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, "__cspViolations", { value: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

/**
 * Reads the violations `recordCspViolations` collected.
 */
async function cspViolations(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const value: unknown = Reflect.get(window, "__cspViolations");
    return Array.isArray(value) ? value.map(String) : [];
  });
}

/**
 * Whether a violation of `rule` on `target` is a known, waived Website defect.
 */
function isKnownAxeIssue(rule: string, target: string): boolean {
  return KNOWN_AXE_ISSUES.some((issue) => issue.rule === rule && issue.target.test(target));
}

test("the focus guard waiver matches only Base UI focus guards on aria-hidden-focus", () => {
  for (const guard of [
    'astro-island[uid="M4ATO"] > span[data-base-ui-focus-guard=""][aria-hidden="true"]:nth-child(1)',
    'span[data-type="outside"][data-base-ui-focus-guard=""][aria-hidden="true"]:nth-child(5)',
    'span[data-type="inside"][data-base-ui-focus-guard=""][aria-hidden="true"]:nth-child(3)',
  ]) {
    expect(isKnownAxeIssue("aria-hidden-focus", guard)).toBe(true);
    expect(isKnownAxeIssue("color-contrast", guard)).toBe(false);
  }
  for (const other of [
    'div[aria-hidden="true"]',
    'span[aria-hidden="true"]',
    '.hero > picture > div[aria-hidden="true"]',
    'span[data-base-ui-focus-guard=""][aria-hidden="true"] > a',
    'span[data-base-ui-focus-guard=""][aria-hidden="true"]:nth-child(1) button',
  ]) {
    expect(isKnownAxeIssue("aria-hidden-focus", other)).toBe(false);
  }
});

for (const keyPage of KEY_PAGES) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`${keyPage.name} (${keyPage.path}) has no axe or CSP violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await recordCspViolations(page);
      const response = await page.goto(keyPage.path);
      expect(response?.status()).toBe(keyPage.status);
      await expect(page.locator("html")).toHaveAttribute("lang", keyPage.lang);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1").first()).toBeVisible();

      expect.soft(await cspViolations(page)).toEqual([]);

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const violations = results.violations.flatMap(({ id, impact, nodes }) =>
        nodes
          .map(({ target }) => target.join(" "))
          .filter((target) => !isKnownAxeIssue(id, target))
          .map((target) => `${id} (${impact ?? "unknown"}): ${target}`),
      );
      expect(violations).toEqual([]);
    });
  }
}

for (const keyPage of KEY_PAGES) {
  test(`${keyPage.name} (${keyPage.path}) has no axe violations at a 768px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const response = await page.goto(keyPage.path);
    expect(response?.status()).toBe(keyPage.status);
    await expect(page.locator("h1").first()).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const violations = results.violations.flatMap(({ id, impact, nodes }) =>
      nodes.map(({ target }) => `${id} (${impact ?? "unknown"}): ${target.join(" ")}`),
    );
    expect(violations).toEqual([]);
  });
}

const SEARCH_BUTTON_NAMES = [
  { width: 1280, name: "Search documentation Ctrl K" },
  { width: 768, name: "Search Ctrl K" },
  { width: 375, name: "Search documentation" },
] as const;

for (const { width, name } of SEARCH_BUTTON_NAMES) {
  test(`the search button is named "${name}" at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto("/");
    await expect(page.locator("[data-search-trigger]").first()).toHaveAccessibleName(name);
  });
}

test("the search button keeps a Command K swap on Apple platforms", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel" });
  });
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.goto("/");
  const trigger = page.locator("[data-search-trigger]").first();
  await expect(trigger.locator("[data-search-modifier]")).toHaveText("⌘");
  await expect(trigger).toHaveAccessibleName("Search documentation ⌘ K");
});

/**
 * Runs axe over the current page state and returns each violation as `<rule> (<impact>): <target>`, waived issues removed.
 */
async function axeViolations(page: Page, scope?: string): Promise<readonly string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  const results = await (scope === undefined ? builder : builder.include(scope)).analyze();
  return results.violations.flatMap(({ id, impact, nodes }) =>
    nodes
      .map(({ target }) => target.join(" "))
      .filter((target) => !isKnownAxeIssue(id, target))
      .map((target) => `${id} (${impact ?? "unknown"}): ${target}`),
  );
}

/** A widget that opens over a page, with the viewport and page it is checked on and how to open it. A `scope` limits axe to one region, for a widget that needs the page scrolled away from the header. */
interface OpenWidget {
  readonly name: string;
  readonly path: string;
  readonly width: number;
  readonly scope?: string;
  readonly open: (page: Page) => Promise<void>;
}

/** The widgets that must stay accessible while open: theme and language menus on the home and a docs page, page actions menu, mobile sheet, search dialog, docs prev/next cards and FAQ. */
const OPEN_WIDGETS: readonly OpenWidget[] = [
  {
    name: "theme menu",
    path: "/",
    width: 1280,
    open: async (page) => {
      await page.locator('button[data-menu="theme-button"]:visible').first().click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "language menu",
    path: "/",
    width: 1280,
    open: async (page) => {
      await page.locator('button[data-menu="lang-trigger"]:visible').first().click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "theme menu on a docs page",
    path: "/docs/start/install/",
    width: 1280,
    open: async (page) => {
      await page.locator('button[data-menu="theme-button"]:visible').first().click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "language menu on a docs page",
    path: "/docs/start/install/",
    width: 1280,
    open: async (page) => {
      await page.locator('button[data-menu="lang-trigger"]:visible').first().click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "page actions menu",
    path: "/docs/start/install/",
    width: 1280,
    open: async (page) => {
      await page
        .locator('[data-page-actions] button[aria-haspopup="menu"]:visible')
        .first()
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "mobile menu sheet",
    path: "/",
    width: 375,
    open: async (page) => {
      await page.locator("button[data-menu-button]:visible").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "docs mobile menu sheet",
    path: "/docs/how-to/check-a-fleet/",
    width: 375,
    open: async (page) => {
      await page.locator("button[data-menu-button]:visible").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "docs prev/next cards",
    path: "/docs/how-to/check-a-fleet/",
    width: 1280,
    scope: ".pagination-links",
    open: async (page) => {
      await page.locator(".pagination-links").scrollIntoViewIfNeeded();
      await expect(page.locator(".pagination-links a")).toHaveCount(2);
    },
  },
  {
    name: "search dialog",
    path: "/docs/start/install/",
    width: 1280,
    open: async (page) => {
      await page.locator("[data-search-trigger]:visible").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "FAQ item",
    path: "/",
    width: 1280,
    scope: '[data-slot="accordion"]',
    open: async (page) => {
      const trigger = page.locator("[data-faq-trigger]").nth(1);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    },
  },
];

/** The viewports the animated home is checked at while its runways pin or stack. */
const HOME_VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

/** The home sections axe visits after scrolling them into view, so pinned states and the awake companion are audited. */
const HOME_STOPS = ["#how", "[data-features]", "[data-showcase]", ".closing"] as const;

/**
 * Waits until no home terminal is part-way through its sequence: each animated terminal shows every
 * fading output line (a `div`; typed commands are spans that never fade) or none, so axe never
 * measures a line caught mid fade-in.
 */
async function settleTerminals(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-terminal-animated]")].every((terminal) => {
      const opacities = [...terminal.querySelectorAll("div[data-terminal-line]")].map((line) =>
        Number(getComputedStyle(line).opacity),
      );
      return opacities.every((value) => value === 1) || opacities.every((value) => value === 0);
    }),
  );
}

for (const path of ["/", "/es/"]) {
  for (const viewport of HOME_VIEWPORTS) {
    for (const colorScheme of COLOR_SCHEMES) {
      test(`${path} has no axe or CSP violations with motion on at ${viewport.name} in ${colorScheme} mode`, async ({
        page,
      }) => {
        /**
         * Five full-page axe passes over the animated home take about 10s alone and near 30s when
         * the suite's other workers load the CPU, so this spec gets three times the default timeout.
         */
        test.slow();
        await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await recordCspViolations(page);
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeAttached();
        const found: string[] = [...(await axeViolations(page))];
        for (const stop of HOME_STOPS) {
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          await page.locator(stop).first().scrollIntoViewIfNeeded();
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          await page.evaluate(() => {
            window.scrollBy({ top: 200, behavior: "instant" });
          });
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          await page.waitForTimeout(800);
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          await settleTerminals(page);
          /* oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each step depends on the scroll before it */
          found.push(...(await axeViolations(page)));
        }
        expect(found).toEqual([]);
        expect(await cspViolations(page)).toEqual([]);
      });
    }
  }
}

for (const widget of OPEN_WIDGETS) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`the ${widget.name} has no axe or CSP violations while open in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: widget.width, height: 900 });
      await recordCspViolations(page);
      await page.goto(widget.path);
      await expect(page.locator("h1").first()).toBeVisible();
      await widget.open(page);
      expect(await axeViolations(page, widget.scope)).toEqual([]);
      expect(await cspViolations(page)).toEqual([]);
    });
  }
}
