import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

/**
 * The notes sit beside the plate only while there is room for them; the
 * stacked breakpoint in CSS and the script's wide query must be one number.
 */
test("the features stacking breakpoint matches the script's wide query", () => {
  const css = read("../../../styles/home.css");
  const script = read("./feature-notes.ts");
  const featuresBlock = css.slice(css.indexOf(".features {\n    height: auto;") - 80);
  const stackedMax = Number(/@media \(max-width: (\d+)px\)/.exec(featuresBlock)?.[1]);
  const wideMin = Number(/\(min-width: (\d+)px\)/.exec(script)?.[1]);
  expect(stackedMax).toBe(1100);
  expect(wideMin).toBe(stackedMax + 1);
});

test("the notes fit beside the plate at the narrowest wide width", () => {
  const width = 1101;
  const leftNoteRightEdge = width - (width * 0.666 + 24);
  const plateLeftEdge = width / 2 - 200;
  const noteWidthPx = 28 * 8;
  expect(leftNoteRightEdge - noteWidthPx).toBeGreaterThanOrEqual(0);
  expect(leftNoteRightEdge).toBeLessThanOrEqual(plateLeftEdge);
});
