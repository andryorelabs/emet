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
  { name: "docs page", path: "/docs/guide/getting-started/", status: 200, lang: "en" },
  { name: "404", path: "/nope/", status: 404, lang: "en" },
  { name: "translated page", path: "/es/", status: 200, lang: "es" },
];

/** The axe rule tags the site holds itself to: WCAG 2.2 A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The color schemes the site renders, since its tokens use `light-dark()`. */
const COLOR_SCHEMES = ["light", "dark"] as const;

/** Each waiver covers one rule on one selector, never a whole page or rule. */
const KNOWN_AXE_ISSUES: readonly KnownAxeIssue[] = [
  {
    rule: "color-contrast",
    target: /(?:^|[\s>])\.io\b/,
    reason:
      "known Website defect: home .io labels lack contrast in light mode; pending a follow-up ticket",
  },
  {
    rule: "label-content-name-mismatch",
    target: /^\.search-button$/,
    reason:
      "known Website defect: Starlight's search button label differs from its text; pending a follow-up ticket",
  },
];

/** The routes whose inline `style` attributes the style-src policy blocks. */
const STYLE_ATTRIBUTE_CSP_ROUTES = ["/", "/es/"];

/**
 * Records every Content-Security-Policy violation the page reports, as
 * `<directive> <blocked URI>`, so an inline script whose hash is missing from
 * the policy fails the spec.
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

for (const keyPage of KEY_PAGES) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`${keyPage.name} (${keyPage.path}) has no axe or script CSP violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await recordCspViolations(page);
      const response = await page.goto(keyPage.path);
      expect(response?.status()).toBe(keyPage.status);
      await expect(page.locator("html")).toHaveAttribute("lang", keyPage.lang);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1").first()).toBeVisible();

      const scriptViolations = (await cspViolations(page)).filter((violation) =>
        violation.startsWith("script-src"),
      );
      expect.soft(scriptViolations).toEqual([]);

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

for (const path of STYLE_ATTRIBUTE_CSP_ROUTES) {
  test(`${path} has no style CSP violations`, async ({ page }) => {
    test.fixme(
      true,
      'known Website defect: inline style="--index: N" attributes break style-src-attr; pending a follow-up ticket',
    );
    await recordCspViolations(page);
    await page.goto(path);
    expect(await cspViolations(page)).toEqual([]);
  });
}
