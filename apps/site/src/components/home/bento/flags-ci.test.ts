import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const stylesDirectory = new URL("../../../styles/bento/", import.meta.url);
const scenesDirectory = new URL("./scenes/", import.meta.url);

const scenes = [
  {
    name: "flags",
    prefix: "flags-",
    keyframes: ["flags-fade", "flags-reach", "flags-flow", "flags-node", "flags-drop"],
  },
  {
    name: "ci",
    prefix: "ci-",
    keyframes: [
      "ci-fade",
      "ci-lint-amber",
      "ci-test-red",
      "ci-test-green",
      "ci-shake",
      "ci-build-green",
      "ci-chip",
      "ci-badge",
    ],
  },
];

const compositeOnly = /^(opacity|transform)$/;
const keyframeBlock = /@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

function readCss(name: string): string {
  return readFileSync(new URL(`${name}.css`, stylesDirectory), "utf8");
}

describe.each(scenes)("$name scene css", ({ name, prefix, keyframes }) => {
  const css = readCss(name);

  it("defines the named keyframes", () => {
    for (const keyframeName of keyframes) {
      expect(css).toContain(`@keyframes ${keyframeName}`);
    }
  });

  it("wraps every animation in the reduced-motion and scripting guard", () => {
    const guardIndex = css.indexOf(
      "@media (scripting: enabled) and (prefers-reduced-motion: no-preference)",
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(css.indexOf("@keyframes")).toBeGreaterThan(guardIndex);
    expect(css.slice(0, guardIndex)).not.toContain("animation:");
  });

  it("runs every animation on the scene cycle and offset", () => {
    const animations = css.match(/animation:[^;]+;/g) ?? [];
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(animation).toContain("var(--scene-cycle)");
      expect(animation).toContain("var(--scene-offset)");
      expect(animation).toContain(prefix);
    }
  });

  it("animates only transform and opacity", () => {
    for (const [, , body] of css.matchAll(keyframeBlock)) {
      const properties = [...(body ?? "").matchAll(/([\w-]+)\s*:/g)].map((match) => match[1] ?? "");
      expect(properties.length).toBeGreaterThan(0);
      for (const property of properties) {
        expect(property).toMatch(compositeOnly);
      }
    }
  });
});

describe("scene components", () => {
  it("stay aria-hidden and import their own stylesheet", () => {
    for (const [component, stylesheet] of [
      ["FlagsScene", "flags.css"],
      ["CiScene", "ci.css"],
    ] as const) {
      const source = readFileSync(new URL(`${component}.astro`, scenesDirectory), "utf8");
      expect(source).toContain('aria-hidden="true"');
      expect(source).toContain(`styles/bento/${stylesheet}`);
    }
  });

  it("render the fix chip and the ready badge in the ci scene", () => {
    const source = readFileSync(new URL("CiScene.astro", scenesDirectory), "utf8");
    expect(source).toContain("ci-badge");
    expect(source).toContain("ci-chip");
  });
});
