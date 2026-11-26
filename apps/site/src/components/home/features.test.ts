import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

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
  it("marks each bento card as a card shell", () => {
    expect(featuresSource).toContain('data-slot="card"');
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

  it("has five more feature rows in every locale", () => {
    expect(featureRowsSource).toContain('data-reveal="item"');
    for (const locale of LOCALES) {
      expect(getStrings(locale).features.extra).toHaveLength(5);
    }
  });
});
