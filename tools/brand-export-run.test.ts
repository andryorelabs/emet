import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";

import { ICO_SIZES, MARK_SIZES, OG_TARGETS, readPngSize } from "./brand-export-spec.ts";
import {
  DEFAULT_BRAND_PATHS,
  type BrandPaths,
  captureStateFrames,
  exportBrand,
  exportMarks,
  exportOg,
  exportPet,
  renderOg,
} from "./brand-export.ts";

/** True when headless Chromium can launch; the browser-backed tests skip elsewhere. */
const HAS_CHROMIUM = await chromium
  .launch({ headless: true })
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

const TOKENS_URL = pathToFileURL(
  join(DEFAULT_BRAND_PATHS.ogSourceDirectory, "..", "tokens.css"),
).href;

let workDirectory = "";

function writeOgSource(name: string, body: string): string {
  const directory = join(workDirectory, `og-source-${name}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "cover.html"), body);
  return directory;
}
let logSpy: ReturnType<typeof spyOn<Console, "log">>;

function scratchPaths(name: string): BrandPaths {
  const root = join(workDirectory, name);
  return {
    ...DEFAULT_BRAND_PATHS,
    pngDirectory: join(root, "png"),
    ogDirectory: join(root, "og"),
    petDirectory: join(root, "pet"),
    framesPath: join(root, "frames.generated.ts"),
    siteFramesPath: join(root, "mascot-frames.generated.ts"),
  };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

function logged(): string[] {
  return logSpy.mock.calls.map((call) => String(call[0]));
}

beforeAll(() => {
  workDirectory = mkdtempSync(join(tmpdir(), "emet-brand-export-"));
});

afterAll(() => {
  rmSync(workDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  logSpy = spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("exportMarks", () => {
  test("writes every mark PNG and a favicon with one entry per ICO size", async () => {
    const paths = scratchPaths("marks");
    await exportMarks(paths);
    for (const size of MARK_SIZES) {
      const png = readFileSync(join(paths.pngDirectory, `mark-${size}.png`));
      expect(readPngSize(png)).toEqual({ width: size, height: size });
    }
    const ico = readFileSync(join(paths.pngDirectory, "favicon.ico"));
    expect(ico.readUInt16LE(4)).toBe(ICO_SIZES.length);
    expect(logged().filter((line) => line.startsWith("brand:export wrote "))).toHaveLength(
      MARK_SIZES.length + 1,
    );
  });

  test("renders the same bytes as the committed marks", async () => {
    const paths = scratchPaths("marks-identical");
    await exportMarks(paths);
    const committed = readFileSync(join(DEFAULT_BRAND_PATHS.pngDirectory, "mark-512.png"));
    expect(readFileSync(join(paths.pngDirectory, "mark-512.png")).equals(committed)).toBe(true);
  });
});

describe.skipIf(!HAS_CHROMIUM)("browser-backed export", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  const cover = OG_TARGETS[0];

  test("renderOg screenshots a committed source at its exact target size", async () => {
    if (!cover) throw new Error("no OG target");
    const png = await renderOg(browser, cover);
    expect(readPngSize(png)).toEqual({ width: cover.spec.width, height: cover.spec.height });
  }, 30_000);

  test("renderOg rejects a page whose brand fonts do not load", async () => {
    if (!cover) throw new Error("no OG target");
    const directory = writeOgSource("nofonts", "<!doctype html><p>plain</p>");
    expect(await rejection(renderOg(browser, cover, directory))).toMatch(
      /cover\.html: fonts not loaded: Space Grotesk, JetBrains Mono/,
    );
  }, 30_000);

  test("renderOg rejects a page that requests the network", async () => {
    if (!cover) throw new Error("no OG target");
    const directory = writeOgSource(
      "network",
      readFileSync(join(DEFAULT_BRAND_PATHS.ogSourceDirectory, "cover.html"), "utf8")
        .replace("../tokens.css", TOKENS_URL)
        .replace("</body>", '<img src="http://example.invalid/x.png"></body>'),
    );
    expect(await rejection(renderOg(browser, cover, directory))).toMatch(
      /cover\.html: network requests blocked: http:\/\/example\.invalid\/x\.png/,
    );
  }, 30_000);

  test("exportOg writes every target PNG at its size", async () => {
    const paths = scratchPaths("og");
    mkdirSync(paths.ogDirectory, { recursive: true });
    await exportOg(paths);
    for (const target of OG_TARGETS) {
      const png = readFileSync(join(paths.ogDirectory, `${target.name}.png`));
      expect(readPngSize(png)).toEqual({ width: target.spec.width, height: target.spec.height });
    }
  }, 60_000);

  test("captureStateFrames rejects art that requests the network", async () => {
    const mascotDirectory = join(workDirectory, "mascot-network");
    mkdirSync(mascotDirectory, { recursive: true });
    writeFileSync(
      join(mascotDirectory, "mascot-sleep.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><image href="http://example.invalid/a.png" width="8" height="8"/></svg>',
    );
    expect(await rejection(captureStateFrames("sleep", mascotDirectory))).toMatch(
      /mascot-sleep\.svg: network requests blocked: http:\/\/example\.invalid\/a\.png/,
    );
  }, 30_000);

  test("exportPet writes the bundle and both generated frame modules", async () => {
    const paths = scratchPaths("pet");
    mkdirSync(join(workDirectory, "pet"), { recursive: true });
    await exportPet(paths);
    expect(JSON.parse(readFileSync(join(paths.petDirectory, "pet.json"), "utf8"))).toMatchObject({
      id: "emet",
      defaultAnimation: "idle",
    });
    const meta = await sharp(join(paths.petDirectory, "spritesheet.webp")).metadata();
    expect([meta.width, meta.height]).toEqual([1536, 1872]);
    expect(existsSync(paths.framesPath)).toBe(true);
    expect(existsSync(paths.siteFramesPath)).toBe(true);
    expect(logged()).toContain("brand:export wrote mod frames (frames.generated.ts)");
  }, 120_000);

  test("exportBrand runs marks, og and pet into the given paths", async () => {
    const paths = scratchPaths("all");
    mkdirSync(paths.ogDirectory, { recursive: true });
    await exportBrand(paths);
    expect(existsSync(join(paths.pngDirectory, "favicon.ico"))).toBe(true);
    expect(existsSync(join(paths.ogDirectory, "cover.png"))).toBe(true);
    expect(existsSync(join(paths.petDirectory, "pet.json"))).toBe(true);
  }, 180_000);
});
