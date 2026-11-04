import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { BANNER_ANSI, BANNER_TEXT, renderBanner } from "./banner.ts";

const terminalDir = path.resolve(import.meta.dir, "../../docs/brand/terminal");

describe("banner art", () => {
  it("is byte-identical to docs/brand/terminal/banner.ansi", () => {
    const expected = fs.readFileSync(path.join(terminalDir, "banner.ansi"));
    expect(Buffer.from(BANNER_ANSI, "utf8").equals(expected)).toBe(true);
  });

  it("is byte-identical to docs/brand/terminal/banner.txt", () => {
    const expected = fs.readFileSync(path.join(terminalDir, "banner.txt"));
    expect(Buffer.from(BANNER_TEXT, "utf8").equals(expected)).toBe(true);
  });

  it("carries the Anthropic notice verbatim", () => {
    expect(BANNER_TEXT).toContain("Not affiliated with or endorsed by Anthropic");
  });
});

describe("renderBanner", () => {
  it("returns the colored art on a TTY without NO_COLOR", () => {
    expect(renderBanner({ isTTY: true }, {})).toBe(BANNER_ANSI);
  });

  it("returns the plain art when NO_COLOR is set", () => {
    expect(renderBanner({ isTTY: true }, { NO_COLOR: "1" })).toBe(BANNER_TEXT);
  });

  it("returns the plain art when the stream is not a TTY", () => {
    expect(renderBanner({ isTTY: false }, {})).toBe(BANNER_TEXT);
    expect(renderBanner({}, {})).toBe(BANNER_TEXT);
  });
});
