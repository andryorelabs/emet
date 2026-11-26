import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/home/hero.css", import.meta.url), "utf8");
const siteCss = readFileSync(new URL("../../styles/site.css", import.meta.url), "utf8");
const motionCss = readFileSync(new URL("../../styles/motion.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("Hero.astro", import.meta.url), "utf8");
const graphicsCss = readFileSync(new URL("../../styles/graphics.css", import.meta.url), "utf8");
const heroFxSource = readFileSync(new URL("hero-fx/index.ts", import.meta.url), "utf8");

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
  it("frames the painting at 50% 62% in the picture, the effects and the Valley scene", () => {
    expect(css.match(/object-position:[^;]+;/g)).toEqual(["object-position: 50% 62%;"]);
    expect(heroFxSource).toContain("HERO_OBJECT_POSITION: readonly [number, number] = [0.5, 0.62]");
    expect(ruleBody(graphicsCss.replaceAll(/\n {2}/g, "\n"), "[data-zoom] .valley")).toContain(
      "--oy: 0.62",
    );
  });

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
    expect(markup).toContain("data-zoom");
    expect(markup).not.toContain("data-recede");
  });

  it("frames the painting at 50% 62% and zooms it from the 50% 70% origin", () => {
    expect(ruleBody(css, ".hero picture img")).toContain("object-position: 50% 62%");
    const zoom = ruleBody(css, ".hero picture,\n.hero .valley");
    expect(zoom).toContain("transform: scale(var(--hs, 1))");
    expect(zoom).toContain("transform-origin: 50% 70%");
    expect(ruleBody(css, ".hero-copy::before")).toContain("oklch(0.16 0.03 150 / 0) 58%");
  });

  it("rises the headline over 1.1s on the prototype curve", () => {
    expect(motionCss).toContain("rise-mask 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) both");
    expect(motionCss).not.toContain("recede");
  });

  it("marks both lines for the letter reaction and tints toward amber with a glow", () => {
    expect(markup.match(/data-letters/g)).toHaveLength(2);
    const letter = ruleBody(css, ".hero-letter");
    expect(letter).toContain("var(--k, 0) * 60%");
    expect(letter).toContain("var(--k, 0) * 28px");
    expect(ruleBody(css, ".hero")).toContain("--hero-amber: oklch(0.92 0.14 95)");
  });

  it("gives the home header white ink over the hero", () => {
    expect(ruleBody(siteCss, ":root")).toContain("--ink-over-painting: oklch(0.985 0.013 150)");
    expect(ruleBody(siteCss, ".site-header--home")).toContain(
      "--header-ink: var(--ink-over-painting)",
    );
  });
});
