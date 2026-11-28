import { describe, expect, it } from "bun:test";

import { VALLEY_PAINTING } from "./painting-fx/painting-data";
import { streamPaths, WATERFALL } from "./stream-paths";

const start = (data: string): string => /^M(\S+ \S+)/.exec(data)?.[1] ?? "";
const first = (points: readonly (readonly number[])[] | undefined): string =>
  points?.[0]?.join(" ") ?? "";
const end = (data: string): string => / (\S+ \S+)$/.exec(data)?.[1] ?? "";

describe("streamPaths", () => {
  const paths = streamPaths();
  const [left, right, middle, river] = VALLEY_PAINTING.river.map((stream) => stream.points);

  it("starts each path at the first point of its painting stream", () => {
    expect(start(paths.left)).toBe(first(left));
    expect(start(paths.right)).toBe(first(right));
    expect(start(paths.middle)).toBe(first(middle));
    expect(start(paths.river)).toBe(first(river));
  });

  it("ends the three streams at the waterfall", () => {
    expect(WATERFALL).toEqual([868, 723]);
    for (const data of [paths.left, paths.middle, paths.right]) {
      expect(end(data)).toBe("868 723");
    }
  });

  it("routes the middle stream through the right stream's tail", () => {
    expect(paths.middle).toContain("940 680");
    expect(paths.middle).toContain("880 721");
  });

  it("builds cubic segments only", () => {
    expect(paths.left.match(/ C/g)?.length).toBe(7);
    expect(paths.river.match(/ C/g)?.length).toBe(3);
  });
});
