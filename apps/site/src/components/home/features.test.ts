import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { LOCALES } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const css = readFileSync(new URL("../../styles/home/features.css", import.meta.url), "utf8");
const sceneDirectory = new URL("../../styles/bento/", import.meta.url);
const sceneCss = readFileSync(new URL("scene.css", sceneDirectory), "utf8");
const featuresSource = readFileSync(new URL("Features.astro", import.meta.url), "utf8");
const featureRowsSource = readFileSync(new URL("FeatureRows.astro", import.meta.url), "utf8");

const motionGuard = "@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {";

/**
 * Returns the offsets of every `@keyframes` in `source` that sits outside the motion guard block.
 */
function unguardedKeyframes(source: string): number[] {
  const guardAt = source.indexOf(motionGuard);
  let guardEnd = -1;
  if (guardAt !== -1) {
    let depth = 0;
    for (let index = guardAt; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          guardEnd = index;
          break;
        }
      }
    }
  }
  const offsets: number[] = [];
  for (const match of source.matchAll(/@keyframes/g)) {
    const offset = match.index;
    if (guardAt === -1 || guardEnd === -1 || offset < guardAt || offset > guardEnd) {
      offsets.push(offset);
    }
  }
  return offsets;
}

describe("Features bento", () => {
  it("renders each bento card with the shadcn Card and no hand-written shell", () => {
    expect(featuresSource).toContain('from "../ui/card"');
    expect(featuresSource).toContain("<Card>");
    expect(featuresSource).not.toContain('data-slot="card"');
  });

  it("links the memory and review cards to their concept pages in every locale", () => {
    for (const locale of LOCALES) {
      const { extra } = getStrings(locale).features;
      expect(extra[1]?.docs).toBe("/docs/concepts/memory/");
      expect(extra[2]?.docs).toBe("/docs/concepts/review-and-gates/");
    }
  });

  it("no longer carries the unused closing action string", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(getStrings(locale).closing)).not.toContain("action");
    }
  });

  it("falls to one column under 760px", () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\) \{\s*\.bento \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it("pauses every scene that is not playing, pseudo-elements included", () => {
    expect(sceneCss).toContain(".scene:not([data-playing]) *::before");
    expect(sceneCss).toContain(".scene:not([data-playing]) *::after");
    expect(sceneCss).toContain("animation-play-state: paused;");
    expect(sceneCss).toContain("--scene-cycle: 7s");
    expect(css).not.toContain(".bento-card:not(.is-in)");
  });

  it("lights the pointer spotlight as a 420px moss circle at 18 %", () => {
    expect(css).toContain("420px circle at var(--spot-x, 50%) var(--spot-y, 50%)");
    expect(css).toContain("color-mix(in oklab, var(--moss) 18%, transparent)");
  });

  it("keeps every keyframe inside the motion guard", () => {
    for (const file of readdirSync(sceneDirectory)) {
      const source = readFileSync(new URL(file, sceneDirectory), "utf8");
      expect(unguardedKeyframes(source)).toEqual([]);
    }
  });

  it("flags a keyframe written outside the motion guard", () => {
    const guarded = `${motionGuard}\n  @keyframes a {\n    to { opacity: 1; }\n  }\n}\n`;
    expect(unguardedKeyframes(guarded)).toEqual([]);
    expect(unguardedKeyframes(`${guarded}@keyframes b { to { opacity: 1; } }`)).toHaveLength(1);
    expect(unguardedKeyframes("@keyframes c { to { opacity: 1; } }")).toHaveLength(1);
  });

  it("fills the content width with the 5/7, 4/4/4 and 12 spans", () => {
    expect(css).not.toMatch(/\.bento \{[^}]*max-width/);
    expect(css).toMatch(/\.bento \{[^}]*gap: 20px/);
    expect(css).toMatch(/\.bento-approval \{\s*grid-column: 1 \/ 6;\s*\}/);
    expect(css).toMatch(/\.bento-review \{\s*grid-column: 6 \/ 13;\s*\}/);
    for (const key of ["flags", "ci", "workers"]) {
      expect(css).toMatch(new RegExp(`\\.bento-${key} \\{\\s*grid-column: \\d+ \\/ \\d+;`));
    }
    expect(css).toMatch(/\.bento-tracker \{\s*grid-column: 1 \/ -1;\s*grid-row: 3;/);
    expect(css).not.toContain("grid-row: 1 / 3");
  });

  it("gives the Tracker 4 columns beside the compact cards in the other 8 from 1024px", () => {
    expect(css).not.toContain("auto-fit");
    expect(featureRowsSource).not.toContain("auto-fit");
    expect(css).toMatch(/\.bento-tracker \{\s*grid-column: 1 \/ -1;\s*grid-row: 3;/);
    expect(css).toMatch(
      /@media \(min-width: 1024px\) \{\s*\.bento-tracker \{\s*grid-column: 1 \/ 5;/,
    );
    expect(featureRowsSource).toMatch(
      /@media \(min-width: 1024px\) \{\s*\.bento-compact \{\s*grid-column: 5 \/ 13;\s*grid-row: 3;/,
    );
    expect(featureRowsSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(featureRowsSource).toContain("grid-template-rows: repeat(3, auto);");
    expect(featureRowsSource).toContain("align-content: stretch;");
    expect(featureRowsSource).toMatch(/\.feature-row:nth-child\(5\) \{\s*grid-column: 1 \/ -1;/);
    expect(featuresSource).toMatch(/<FeatureRows[^>]*\/>\s*<\/ul>/);
  });

  it("puts the Tracker on a full row with the compact block below it from 761px to 1023px", () => {
    expect(featureRowsSource).toMatch(
      /@media \(min-width: 761px\) \{\s*\.bento-compact \{\s*grid-column: 1 \/ -1;\s*grid-row: 4;/,
    );
    expect(featureRowsSource).not.toContain("grid-column: 6 / 13");
  });

  it("anchors scene content to the bottom", () => {
    expect(css).toMatch(
      /\.bento-visual \{[^}]*align-items: stretch;[^}]*justify-content: flex-end/,
    );
  });

  it("has five compact cards in every locale, each linking to a docs page", () => {
    expect(featureRowsSource).toContain("localePath(locale, note.docs)");
    expect(featureRowsSource).toContain("CardTitle");
    for (const locale of LOCALES) {
      const extra = getStrings(locale).features.extra;
      expect(extra).toHaveLength(5);
      for (const note of extra) {
        expect(Object.keys(note).toSorted()).toEqual(["docs", "title"]);
        expect(
          existsSync(new URL(`../../../../..${note.docs.replace(/\/$/, ".md")}`, import.meta.url)),
        ).toBe(true);
      }
    }
  });
});
