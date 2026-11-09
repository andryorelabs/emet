import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const stylesDirectory = join(import.meta.dir, "../../../styles/bento");
const scenesDirectory = join(import.meta.dir, "scenes");

function read(directory: string, name: string): string {
  return readFileSync(join(directory, name), "utf8");
}

function keyframeNames(css: string): string[] {
  return [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1] ?? "");
}

function keyframeBody(css: string, name: string): string {
  const start = css.indexOf(`@keyframes ${name} `);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open, index + 1);
  }
  return "";
}

const scenes = [
  { name: "approval", prefix: "approval-" },
  { name: "review", prefix: "review-" },
] as const;

describe.each(scenes)("$name scene", ({ name, prefix }) => {
  const css = read(stylesDirectory, `${name}.css`);
  const markup = read(scenesDirectory, `${name[0]?.toUpperCase()}${name.slice(1)}Scene.astro`);

  it("names every keyframe with the scene prefix", () => {
    const names = keyframeNames(css);
    expect(names.length).toBeGreaterThan(0);
    for (const keyframe of names) expect(keyframe.startsWith(prefix)).toBe(true);
  });

  it("runs on the scene cycle and offset variables", () => {
    expect(css).toContain("var(--scene-cycle)");
    expect(css).toContain("calc(var(--scene-offset) * -1)");
    expect(css).toContain("infinite");
  });

  it("declares animations only inside the scripting and no-preference motion guard", () => {
    const animationLines = css.split("\n").filter((line) => line.includes("animation:"));
    expect(animationLines.length).toBeGreaterThan(0);
    const guardStart = css.indexOf(
      "@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {",
    );
    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(css.slice(0, guardStart)).not.toContain("animation:");
  });

  it("animates only transform and opacity", () => {
    for (const keyframe of keyframeNames(css)) {
      const properties = [...keyframeBody(css, keyframe).matchAll(/([\w-]+)\s*:/g)].map(
        (match) => match[1] ?? "",
      );
      for (const property of properties) expect(["opacity", "transform"]).toContain(property);
    }
  });

  it("keeps the scene hidden from assistive tech and imports its stylesheet", () => {
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(`styles/bento/${name}.css`);
  });
});

describe("approval beats", () => {
  const css = read(stylesDirectory, "approval.css");

  it("has staggered skeletons, a press at 0.97 and a stamp dropping from 1.7", () => {
    const names = keyframeNames(css);
    for (const expected of ["approval-skeleton-0", "approval-skeleton-3", "approval-dot-3"]) {
      expect(names).toContain(expected);
    }
    expect(keyframeBody(css, "approval-button")).toContain("scale(0.97)");
    const stamp = keyframeBody(css, "approval-stamp-drop");
    expect(stamp).toContain("rotate(-6deg) scale(1.7)");
    expect(stamp).toContain("rotate(-6deg) scale(1)");
  });

  it("ends on the static frame: filled dots, shown names and stamp", () => {
    expect(keyframeBody(css, "approval-dot-0")).toMatch(/100%\s*\{[^}]*opacity: 1/);
    expect(keyframeBody(css, "approval-name-0")).toMatch(/100%\s*\{[^}]*opacity: 1/);
    expect(keyframeBody(css, "approval-stamp-drop")).toMatch(/100%\s*\{[^}]*opacity: 1/);
  });
});

describe("review beats", () => {
  const css = read(stylesDirectory, "review.css");

  it("fills bars with scaleX, pops checks from 0.6 and sweeps a scan line", () => {
    expect(keyframeBody(css, "review-fill-1")).toContain("scaleX(0)");
    expect(keyframeBody(css, "review-check-1")).toContain("scale(0.6)");
    expect(keyframeBody(css, "review-check-2")).toContain("scale(0.6)");
    expect(keyframeBody(css, "review-scan")).toContain("translateX");
  });

  it("uses the amber warn token for the finding and moss for the fix", () => {
    expect(css).toContain("var(--warn)");
    expect(css).toMatch(/review-line-flagged::after\s*\{\s*background: var\(--moss\)/);
  });
});
