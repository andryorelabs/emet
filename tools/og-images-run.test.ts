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
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

import { LOCALES } from "../apps/site/src/i18n/locales.ts";
import { readPngSize } from "./brand-export-spec.ts";
import {
  OG_HEIGHT,
  OG_MAX_BYTES,
  OG_WIDTH,
  renderInstallIcons,
  renderShareImages,
} from "./og-images.ts";

const PUBLIC_DIRECTORY = join(import.meta.dir, "..", "apps", "site", "public");

/** True when headless Chromium can launch; the share image test skips elsewhere. */
const HAS_CHROMIUM = await chromium
  .launch({ headless: true })
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

let outputDirectory = "";
let logSpy: ReturnType<typeof spyOn<Console, "log">>;

beforeAll(() => {
  outputDirectory = mkdtempSync(join(tmpdir(), "emet-og-images-"));
});

afterAll(() => {
  rmSync(outputDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  logSpy = spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("renderInstallIcons", () => {
  test("writes the install icons at their sizes and copies the favicon", async () => {
    await renderInstallIcons(outputDirectory);
    const expected = [
      ["apple-touch-icon.png", 180],
      ["icons/icon-192.png", 192],
      ["icons/icon-512.png", 512],
    ] as const;
    for (const [path, size] of expected) {
      expect(readPngSize(readFileSync(join(outputDirectory, path)))).toEqual({
        width: size,
        height: size,
      });
    }
    const favicon = readFileSync(join(outputDirectory, "favicon.ico"));
    expect(favicon.equals(readFileSync(join(PUBLIC_DIRECTORY, "favicon.ico")))).toBe(true);
    const messages = logSpy.mock.calls.map((call) => String(call[0]));
    expect(messages).toContain("brand:og copied favicon.ico");
    expect(messages.filter((line) => line.startsWith("brand:og wrote "))).toHaveLength(3);
  });

  test("renders the committed install icons byte for byte", async () => {
    await renderInstallIcons(outputDirectory);
    const committed = readFileSync(join(PUBLIC_DIRECTORY, "icons", "icon-192.png"));
    expect(readFileSync(join(outputDirectory, "icons", "icon-192.png")).equals(committed)).toBe(
      true,
    );
  });
});

describe.skipIf(!HAS_CHROMIUM)("renderShareImages", () => {
  test("writes one share image per locale within the byte budget", async () => {
    await renderShareImages(outputDirectory);
    const files = readdirSync(join(outputDirectory, "og")).toSorted();
    expect(files).toEqual(LOCALES.map((locale) => `og-${locale}.png`).toSorted());
    for (const file of files) {
      const png = readFileSync(join(outputDirectory, "og", file));
      expect(readPngSize(png)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
      expect(png.byteLength).toBeLessThanOrEqual(OG_MAX_BYTES);
    }
  }, 120_000);

  test("fails the render when the font is requested over the network", async () => {
    const directory = join(outputDirectory, "blocked");
    let message = "resolved";
    try {
      await renderShareImages(directory, "http://example.invalid/font.woff2");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/og-[\w-]+: blocked http:\/\/example\.invalid\/font\.woff2/);
  }, 60_000);
});
