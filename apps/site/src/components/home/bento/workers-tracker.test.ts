import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const stylesDirectory = new URL("../../../styles/bento/", import.meta.url);
const motionGuard = "@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {";

/**
 * Reads one scene stylesheet.
 */
function readSceneCss(name: string): string {
  return readFileSync(new URL(`${name}.css`, stylesDirectory), "utf8");
}

/**
 * Returns the source after the motion guard opens, where all animation must live.
 */
function guardedPart(source: string): string {
  const guardAt = source.indexOf(motionGuard);
  expect(guardAt).toBeGreaterThan(-1);
  return source.slice(guardAt);
}

/**
 * Returns every property declared inside the `@keyframes` blocks of `source`.
 */
function keyframeProperties(source: string): string[] {
  const properties: string[] = [];
  for (const block of source.matchAll(/@keyframes [\w-]+ \{([\s\S]*?\n {2}\})/g)) {
    for (const declaration of (block[1] ?? "").matchAll(/^\s+([a-z-]+):/gm)) {
      const property = declaration[1];
      if (property !== undefined && property !== "animation-timing-function") {
        properties.push(property);
      }
    }
  }
  return properties;
}

const scenes = [
  {
    name: "workers",
    prefix: "workers-",
    keyframes: ["workers-line", "workers-typing", "workers-check"],
  },
  {
    name: "tracker",
    prefix: "tracker-",
    keyframes: ["tracker-pill", "tracker-status-closed", "tracker-check", "tracker-stage"],
  },
];

describe.each(scenes)("$name scene stylesheet", ({ name, prefix, keyframes }) => {
  const source = readSceneCss(name);

  it("keeps every keyframe behind the motion guard", () => {
    const outside = source.slice(0, Math.max(source.indexOf(motionGuard), 0));
    expect(outside).not.toContain("@keyframes");
    expect(outside).not.toContain("animation:");
    expect(source).toContain(motionGuard);
  });

  it("names its keyframes with the scene prefix", () => {
    const names = [...source.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const keyframe of names) expect(keyframe?.startsWith(prefix)).toBe(true);
    for (const keyframe of keyframes) expect(names).toContain(keyframe);
  });

  it("runs on the shared cycle and offset variables", () => {
    const guarded = guardedPart(source);
    expect(guarded).toContain("var(--scene-cycle)");
    expect(guarded).toContain("calc(var(--scene-offset) * -1");
    expect(guarded).not.toMatch(/(?<!\* -1 \+ )(?<!\(|\* )var\(--scene-offset\)(?! \* -1)/);
    expect(guarded).toContain("infinite");
  });

  it("animates only transform and opacity", () => {
    const properties = keyframeProperties(guardedPart(source));
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) expect(["transform", "opacity"]).toContain(property);
  });
});

describe("workers beats", () => {
  const source = readSceneCss("workers");

  it("staggers typing by 200ms and checks by 150ms", () => {
    expect(source).toContain("var(--index) * 200ms");
    expect(source).toContain("var(--index) * 150ms");
  });

  it("grows the branch lines with scaleY", () => {
    expect(source).toMatch(/@keyframes workers-line \{[\s\S]*?scaleY/);
  });
});

describe("tracker beats", () => {
  const source = readSceneCss("tracker");

  it("slides the pill with a transform", () => {
    expect(source).toMatch(/@keyframes tracker-pill \{[\s\S]*?translateX/);
  });
});
