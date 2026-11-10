import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { BANNER_ANSI, BANNER_TEXT, renderBanner } from "./banner.ts";

const terminalDir = path.resolve(import.meta.dir, "../../docs/brand/terminal");
const itWithBrandKit = fs.existsSync(terminalDir) ? it : it.skip;

describe("banner art", () => {
  itWithBrandKit("is byte-identical to docs/brand/terminal/banner.ansi", () => {
    const expected = fs.readFileSync(path.join(terminalDir, "banner.ansi"));
    expect(Buffer.from(BANNER_ANSI, "utf8").equals(expected)).toBe(true);
  });

  itWithBrandKit("is byte-identical to docs/brand/terminal/banner.txt", () => {
    const expected = fs.readFileSync(path.join(terminalDir, "banner.txt"));
    expect(Buffer.from(BANNER_TEXT, "utf8").equals(expected)).toBe(true);
  });

  it("names both Agent hosts in the tagline", () => {
    expect(BANNER_TEXT).toContain("emet  plugin for Claude Code and Codex");
  });

  it("carries the Anthropic and OpenAI notice verbatim", () => {
    expect(BANNER_TEXT).toContain("Not affiliated with or endorsed by Anthropic or OpenAI");
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

describe("banner on the CLI", () => {
  const entry = path.resolve(import.meta.dir, "../bin/emet.ts");
  const run = (args: string[], env: Record<string, string>) =>
    Bun.spawnSync(["bun", entry, ...args], {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });

  it("starts --help output with banner.txt under NO_COLOR", () => {
    const result = run(["--help"], { NO_COLOR: "1" });
    expect(result.stdout.toString().startsWith(BANNER_TEXT)).toBe(true);
  });

  it("keeps the banner out of machine-read output", () => {
    const firstLine = BANNER_TEXT.split("\n").find((line) => line.trim() !== "") ?? BANNER_TEXT;
    const result = run(["claims", "--list"], {});
    expect(result.stdout.toString()).not.toContain(firstLine);
  });
});
