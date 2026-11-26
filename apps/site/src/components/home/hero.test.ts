import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/home/hero.css", import.meta.url), "utf8");
const siteCss = readFileSync(new URL("../../styles/site.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("Hero.astro", import.meta.url), "utf8");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(source);
  if (match?.[1] === undefined) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Home hero", () => {
  it("sets the sentence at 20px and weight 500 in white over a dark scrim", () => {
    const sentence = ruleBody(css, ".hero-sentence");
    expect(sentence).toContain("font-size: 20px");
    expect(sentence).toContain("font-weight: 500");
    expect(ruleBody(css, ".hero-copy")).toContain("color: var(--ink-over-painting)");
    expect(ruleBody(css, ".hero-copy::before")).toContain("linear-gradient");
  });

  it("splits the headline into two masked lines that wrap at word boundaries", () => {
    expect(markup).toContain('class="hero-line hero-line-one"');
    expect(markup).toContain('class="hero-line hero-line-two"');
    expect(ruleBody(css, ".hero-line")).toContain("overflow: clip");
    expect(ruleBody(css, ".hero-line")).toContain("word-break: normal");
    expect(ruleBody(css, ".hero-line-two")).toContain("justify-self: end");
    expect(ruleBody(css, ".hero-line-one")).toContain("align-self: end");
  });

  it("keeps the actions on the left and the screen-reader name in the h1", () => {
    expect(ruleBody(css, ".hero-mid")).toContain("align-items: flex-start");
    expect(markup).toContain('<span class="sr-only">{hero.name}. </span>');
    expect(markup).toContain("data-recede");
  });

  it("gives the home header white ink over the hero", () => {
    expect(ruleBody(siteCss, ":root")).toContain("--ink-over-painting: oklch(0.985 0.013 150)");
    expect(ruleBody(siteCss, ".site-header--home")).toContain(
      "--header-ink: var(--ink-over-painting)",
    );
  });
});
