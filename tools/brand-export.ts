/**
 * `bun run brand:export`: renders the brand kit's raster assets from their
 * vector and HTML sources, offline, and checks every output against
 * `tools/brand-export-spec.ts` before writing it.
 *
 * - `docs/brand/logo/mark.svg` -> `docs/brand/logo/png/mark-<size>.png` and
 *   `docs/brand/logo/png/favicon.ico` (rasterised by sharp).
 * - `docs/brand/og/<name>.html` -> `docs/brand/og/<name>.png` (rendered by
 *   headless Chromium through Playwright; any non-`file:` request fails the
 *   export, so fonts come only from `docs/brand/brandbook/fonts/`).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type Frame,
  type MascotState,
  buildManifest,
  buildRows,
  composeSheet,
  validateManifest,
} from "./brand-pet.ts";
import { GENERATED_FRAMES_PATH, buildFramesModule } from "./brand-frames.ts";
import {
  ICO_MAX_BYTES,
  ICO_SIZES,
  MARK_MAX_BYTES,
  MARK_SIZES,
  OG_TARGETS,
  type OgTarget,
  assertSpec,
  encodeIco,
} from "./brand-export-spec.ts";

export type { Frame, MascotState };

const BRAND_DIRECTORY = join(import.meta.dir, "..", "docs", "brand");
const MARK_SOURCE = join(BRAND_DIRECTORY, "logo", "mark.svg");
const PNG_DIRECTORY = join(BRAND_DIRECTORY, "logo", "png");
const OG_DIRECTORY = join(BRAND_DIRECTORY, "og");
const MASCOT_DIRECTORY = join(BRAND_DIRECTORY, "mascot");
const PET_DIRECTORY = join(BRAND_DIRECTORY, "pet", "emet");
const FRAME_ART_HEIGHT = FRAME_WIDTH;
const FRAME_PADDING = (FRAME_HEIGHT - FRAME_ART_HEIGHT) / 2;
/** One 2 s halo pulse sampled every 250 ms, so the work loop is smooth at Orca's playback rate. */
const ANIMATED_FRAME_COUNT = 8;
const ANIMATED_FRAME_MS = 250;
const STILL_FRAME_MS = 1000;
const REQUIRED_FONTS = ["Space Grotesk", "JetBrains Mono"];
const DEFAULT_SVG_DENSITY = 72;

/**
 * Runs in the page: waits for font loading, then lists the families of the
 * faces that loaded. A string, because `tools/` typechecks without DOM types.
 */
const LOADED_FONTS_PROBE = `document.fonts.ready.then(() =>
  [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family))`;

/** Narrows the probe result to a list of family names, unquoted. */
function parseFontFamilies(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("font probe returned an unexpected value");
  }
  return value.map((family: string) => family.replaceAll('"', ""));
}

/** Re-encodes a PNG as truecolour RGBA with maximum lossless compression. */
async function compressPng(png: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp(png).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer(),
  );
}

/** Rasterises `svg` to a transparent square PNG of `size` pixels. */
async function rasteriseSquare(svg: Buffer, intrinsicWidth: number, size: number) {
  const density = (DEFAULT_SVG_DENSITY * size) / intrinsicWidth;
  const png = await sharp(svg, { density })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return compressPng(new Uint8Array(png));
}

/** Writes `buffer` to `path` after it passes `assertSpec`, and logs it. */
function writeChecked(
  path: string,
  name: string,
  buffer: Uint8Array,
  spec: Parameters<typeof assertSpec>[2],
) {
  assertSpec(name, buffer, spec);
  writeFileSync(path, buffer);
  console.log(`brand:export wrote ${name} (${spec.width}x${spec.height}, ${buffer.byteLength} B)`);
}

/** Exports the square mark PNGs and the favicon ICO built from them. */
async function exportMarks(): Promise<void> {
  const svg = readFileSync(MARK_SOURCE);
  const { width } = await sharp(svg).metadata();
  if (!width) throw new Error(`${MARK_SOURCE}: cannot read the SVG width`);
  mkdirSync(PNG_DIRECTORY, { recursive: true });
  const sizes = [...new Set<number>([...MARK_SIZES, ...ICO_SIZES])];
  const pngs = await Promise.all(sizes.map(async (size) => rasteriseSquare(svg, width, size)));
  const rendered = new Map(sizes.map((size, index) => [size, pngs[index]]));
  for (const size of MARK_SIZES) {
    const name = `mark-${size}.png`;
    const png = rendered.get(size);
    if (!png) throw new Error(`${name}: not rendered`);
    writeChecked(join(PNG_DIRECTORY, name), name, png, {
      width: size,
      height: size,
      maxBytes: MARK_MAX_BYTES,
    });
  }
  const icoImages = ICO_SIZES.map((size) => {
    const png = rendered.get(size);
    if (!png) throw new Error(`favicon.ico: ${size} px entry not rendered`);
    assertSpec(`favicon.ico ${size} px entry`, png, {
      width: size,
      height: size,
      maxBytes: ICO_MAX_BYTES,
    });
    return png;
  });
  const ico = encodeIco(icoImages);
  if (ico.byteLength > ICO_MAX_BYTES) {
    throw new Error(`favicon.ico: ${ico.byteLength} bytes exceeds ${ICO_MAX_BYTES} bytes`);
  }
  writeFileSync(join(PNG_DIRECTORY, "favicon.ico"), ico);
  console.log(`brand:export wrote favicon.ico (${ICO_SIZES.join(", ")} px, ${ico.byteLength} B)`);
}

/**
 * Renders one OG HTML source at its exact target size. Throws when the page
 * asks for anything outside `file:`, or when a brand font failed to load.
 */
async function renderOg(browser: Browser, target: OgTarget): Promise<Uint8Array> {
  const { width, height } = target.spec;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const blocked: string[] = [];
  try {
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("file:")) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    const source = join(OG_DIRECTORY, `${target.name}.html`);
    await page.goto(pathToFileURL(source).href, { waitUntil: "load" });
    const loadedFonts = parseFontFamilies(await page.evaluate(LOADED_FONTS_PROBE));
    const missingFonts = REQUIRED_FONTS.filter(
      (family) => !loadedFonts.some((loaded) => loaded === family),
    );
    if (missingFonts.length > 0) {
      throw new Error(`${target.name}.html: fonts not loaded: ${missingFonts.join(", ")}`);
    }
    if (blocked.length > 0) {
      throw new Error(`${target.name}.html: network requests blocked: ${blocked.join(", ")}`);
    }
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return await compressPng(new Uint8Array(screenshot));
  } finally {
    await page.close();
  }
}

/** Exports the README covers and GitHub social previews. */
async function exportOg(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const pngs = await Promise.all(OG_TARGETS.map(async (target) => renderOg(browser, target)));
    OG_TARGETS.forEach((target, index) => {
      const name = `${target.name}.png`;
      const png = pngs[index];
      if (!png) throw new Error(`${name}: not rendered`);
      writeChecked(join(OG_DIRECTORY, name), name, png, target.spec);
    });
  } finally {
    await browser.close();
  }
}

const STATE_SOURCES: Readonly<Record<MascotState, { file: string; animated: boolean }>> = {
  sleep: { file: "mascot-sleep.svg", animated: false },
  work: { file: "mascot-work-animated.svg", animated: true },
  waiting: { file: "mascot-waiting.svg", animated: false },
  done: { file: "mascot-done.svg", animated: false },
  error: { file: "mascot-error.svg", animated: false },
};

/**
 * Runs in the page: sizes the root SVG to the frame width and lets the
 * transparent page show through. A string, because `tools/` has no DOM types.
 */
const FIT_SVG_SCRIPT = `(() => {
  const root = document.documentElement;
  root.setAttribute("width", "${FRAME_WIDTH}");
  root.setAttribute("height", "${FRAME_ART_HEIGHT}");
  root.style.background = "transparent";
})()`;

/**
 * Pauses every animation of the page, seeks all of them to `timeMs` and waits
 * until the pause has taken effect and two frames have painted.
 */
function seekScript(timeMs: number): string {
  return `(async () => {
    const animations = document.getAnimations();
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = ${timeMs};
    });
    await Promise.all(animations.map((animation) => animation.ready));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`;
}

/** Pads a square screenshot to the Orca frame size, transparent above and below. */
async function padToFrame(screenshot: Uint8Array): Promise<Uint8Array> {
  const padded = await sharp(screenshot)
    .extend({
      top: FRAME_PADDING,
      bottom: FRAME_PADDING,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return compressPng(new Uint8Array(padded));
}

/** Seeks the page animations to `seekMs` when given, then screenshots one padded frame. */
async function captureFrame(page: Page, seekMs: number | undefined): Promise<Uint8Array> {
  if (seekMs !== undefined) await page.evaluate(seekScript(seekMs));
  const screenshot = await page.screenshot({ type: "png", omitBackground: true });
  return padToFrame(new Uint8Array(screenshot));
}

/**
 * Captures the frames of one mascot state in offline headless Chromium.
 * Animated art is stepped through `document.getAnimations()` `currentTime`,
 * never the wall clock, so two runs are byte-identical. Throws when the page
 * asks for anything outside `file:`.
 */
export async function captureStateFrames(state: MascotState): Promise<Frame[]> {
  const source = STATE_SOURCES[state];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: FRAME_WIDTH, height: FRAME_ART_HEIGHT },
      deviceScaleFactor: 1,
    });
    const blocked: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("file:")) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    await page.goto(pathToFileURL(join(MASCOT_DIRECTORY, source.file)).href, { waitUntil: "load" });
    await page.evaluate(FIT_SVG_SCRIPT);
    const count = source.animated ? ANIMATED_FRAME_COUNT : 1;
    const durationMs = source.animated ? ANIMATED_FRAME_MS : STILL_FRAME_MS;
    const frames: Frame[] = [];
    for (let index = 0; index < count; index++) {
      const seekMs = source.animated ? index * durationMs : undefined;
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: one page is seeked and screenshotted frame by frame
      frames.push({ png: await captureFrame(page, seekMs), durationMs });
    }
    if (blocked.length > 0) {
      throw new Error(`${source.file}: network requests blocked: ${blocked.join(", ")}`);
    }
    return frames;
  } finally {
    await browser.close();
  }
}

/** Exports the Orca pet bundle `docs/brand/pet/emet/{pet.json,spritesheet.webp}`. */
async function exportPet(): Promise<void> {
  const [sleep, work, waiting, done, error] = await Promise.all([
    captureStateFrames("sleep"),
    captureStateFrames("work"),
    captureStateFrames("waiting"),
    captureStateFrames("done"),
    captureStateFrames("error"),
  ]);
  const captured: Record<MascotState, Frame[]> = { sleep, work, waiting, done, error };
  const rows = await buildRows(captured);
  const sheet = await composeSheet(rows);
  const manifest = buildManifest(rows);
  const problems = validateManifest(manifest, sheet.byteLength);
  if (problems.length > 0) throw new Error(`pet.json: ${problems.join("; ")}`);
  mkdirSync(PET_DIRECTORY, { recursive: true });
  writeFileSync(join(PET_DIRECTORY, "spritesheet.webp"), sheet);
  writeFileSync(join(PET_DIRECTORY, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`brand:export wrote pet bundle (spritesheet.webp ${sheet.byteLength} B)`);
  writeFileSync(GENERATED_FRAMES_PATH, await buildFramesModule(captured));
  console.log("brand:export wrote mod frames (frames.generated.ts)");
}

/** Renders and checks every raster asset of the brand kit. */
export async function exportBrand(): Promise<void> {
  await exportMarks();
  await exportOg();
  await exportPet();
}

if (import.meta.main) await exportBrand();
