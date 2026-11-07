/**
 * `bun run brand:og`: renders the Website's per-locale share images
 * (`apps/site/public/og/og-<locale>.png`, 1200x630) with headless Chromium
 * through Playwright, and the install icons (`favicon.ico`,
 * `apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png`) from the
 * brand mark. Latin and Cyrillic text uses the Website's local Space Grotesk;
 * Japanese, Korean and Chinese fall back to the CJK fonts installed on the
 * machine that runs the script. Run by hand; the outputs are committed. Any
 * non-`file:` request fails the render.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { LOCALES, type Locale } from "../apps/site/src/i18n/locales.ts";
import { getStrings } from "../apps/site/src/i18n/ui/index.ts";
import { KB, assertSpec } from "./brand-export-spec.ts";

/** Width of a share image, in pixels. */
export const OG_WIDTH = 1200;

/** Height of a share image, in pixels. */
export const OG_HEIGHT = 630;

/** Byte budget of a share image. */
export const OG_MAX_BYTES = 400 * KB;

const REPOSITORY_ROOT = join(import.meta.dir, "..");
const SITE_PUBLIC = join(REPOSITORY_ROOT, "apps", "site", "public");
const MARK_SOURCE = join(REPOSITORY_ROOT, "docs", "brand", "logo", "mark.svg");
const ICO_SOURCE = join(REPOSITORY_ROOT, "docs", "brand", "logo", "png", "favicon.ico");
const FONT_SOURCE = join(SITE_PUBLIC, "fonts", "SpaceGrotesk-var.woff2");
const ICON_BACKGROUND = "#f4fdf6";
const INSTALL_ICONS = [
  { path: "apple-touch-icon.png", size: 180 },
  { path: join("icons", "icon-192.png"), size: 192 },
  { path: join("icons", "icon-512.png"), size: 512 },
] as const;
const CJK_FALLBACK = [
  "Noto Sans CJK JP",
  "Noto Sans CJK KR",
  "Noto Sans CJK SC",
  "Noto Sans JP",
  "Noto Sans KR",
  "Noto Sans SC",
  "WenQuanYi Zen Hei",
  "IPAGothic",
  "Unifont",
]
  .map((family) => `"${family}"`)
  .join(", ");

/**
 * The text of one share image.
 */
export interface OgCopy {
  locale: Locale;
  tagline: string;
  description: string;
}

/**
 * Escapes the characters HTML reserves in text.
 * @param value - Raw text.
 * @returns The escaped text.
 */
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Reads a locale's share copy from its home page strings: the tagline is the
 * title after "emet:" (or the fullwidth colon), the description is the meta description.
 * @param locale - A supported locale.
 * @returns The copy to render.
 */
export function ogCopy(locale: Locale): OgCopy {
  const { title, description } = getStrings(locale).meta;
  const tagline = title.replace(/^emet\s*[:：]\s*/, "");
  return { locale, tagline, description };
}

/**
 * Builds the HTML of one share image.
 * @param copy - The text to render.
 * @param markSvg - The brand mark's SVG source.
 * @param fontUrl - `file:` URL of the Space Grotesk woff2.
 * @returns A complete HTML document sized for the image.
 */
export function buildOgHtml(copy: OgCopy, markSvg: string, fontUrl: string): string {
  return `<!doctype html>
<html lang="${copy.locale}">
<head>
<meta charset="utf-8">
<style>
@font-face { font-family: "Space Grotesk"; src: url("${fontUrl}") format("woff2"); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; overflow: hidden; }
body {
  background: oklch(0.165 0.013 150);
  color: oklch(0.96 0.01 150);
  font-family: "Space Grotesk", ${CJK_FALLBACK}, sans-serif;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 72px 88px;
  border-bottom: 10px solid oklch(0.74 0.13 135);
}
.brand { display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 700; }
.brand svg { width: 72px; height: 72px; }
h1 { font-size: 76px; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; max-width: 1000px; }
.copy { display: flex; flex-direction: column; gap: 28px; }
p { font-size: 30px; line-height: 1.4; color: oklch(0.78 0.02 150); max-width: 960px; }
.host { font-size: 26px; color: oklch(0.74 0.13 135); }
</style>
</head>
<body>
<div class="brand">${markSvg}<span>emet</span></div>
<div class="copy"><h1>${escapeHtml(copy.tagline)}</h1><p>${escapeHtml(copy.description)}</p></div>
<div class="host">emet.andryore.dev</div>
</body>
</html>
`;
}

/**
 * Renders one locale's share image and writes it into `outputDirectory`.
 * @param browser - The running Chromium.
 * @param locale - The locale to render.
 * @param markSvg - The brand mark's SVG source.
 * @param workDirectory - Scratch directory for the HTML source.
 * @param outputDirectory - Where the PNG goes.
 * @returns Nothing; throws on a blocked request, a wrong size or an oversize file.
 */
async function renderShareImage(
  browser: Browser,
  locale: Locale,
  markSvg: string,
  workDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 1,
  });
  const blocked: string[] = [];
  try {
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("file:")) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    const source = join(workDirectory, `og-${locale}.html`);
    writeFileSync(source, buildOgHtml(ogCopy(locale), markSvg, pathToFileURL(FONT_SOURCE).href));
    await page.goto(pathToFileURL(source).href, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready.then(() => undefined)");
    if (blocked.length > 0) throw new Error(`og-${locale}: blocked ${blocked.join(", ")}`);
    const screenshot = new Uint8Array(await page.screenshot({ type: "png" }));
    const png = new Uint8Array(
      await sharp(screenshot).png({ compressionLevel: 9, effort: 10 }).toBuffer(),
    );
    const name = `og-${locale}.png`;
    assertSpec(name, png, { width: OG_WIDTH, height: OG_HEIGHT, maxBytes: OG_MAX_BYTES });
    writeFileSync(join(outputDirectory, name), png);
    console.log(`brand:og wrote ${name} (${png.byteLength} B)`);
  } finally {
    await page.close();
  }
}

/**
 * Renders every locale's share image into `apps/site/public/og/`.
 * @returns Nothing.
 */
async function renderShareImages(): Promise<void> {
  const outputDirectory = join(SITE_PUBLIC, "og");
  mkdirSync(outputDirectory, { recursive: true });
  const markSvg = readFileSync(MARK_SOURCE, "utf8");
  const workDirectory = mkdtempSync(join(tmpdir(), "emet-og-"));
  const browser = await chromium.launch({ headless: true });
  try {
    await Promise.all(
      LOCALES.map((locale) =>
        renderShareImage(browser, locale, markSvg, workDirectory, outputDirectory),
      ),
    );
  } finally {
    await browser.close();
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

/**
 * Writes one install icon: the brand mark centred on the light background.
 * @param markSvg - The brand mark's SVG source.
 * @param path - Output path below `apps/site/public/`.
 * @param size - Side in pixels.
 * @returns Nothing.
 */
async function renderInstallIcon(markSvg: Buffer, path: string, size: number): Promise<void> {
  const markSize = Math.round(size * 0.62);
  const mark = await sharp(markSvg, { density: (72 * markSize) / 32 })
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  const png = new Uint8Array(
    await sharp({
      create: { width: size, height: size, channels: 4, background: ICON_BACKGROUND },
    })
      .composite([{ input: mark, gravity: "centre" }])
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
  assertSpec(path, png, { width: size, height: size, maxBytes: 64 * KB });
  writeFileSync(join(SITE_PUBLIC, path), png);
  console.log(`brand:og wrote ${path} (${size}x${size}, ${png.byteLength} B)`);
}

/**
 * Writes the install icons and copies the brand `favicon.ico`.
 * @returns Nothing.
 */
async function renderInstallIcons(): Promise<void> {
  const markSvg = readFileSync(MARK_SOURCE);
  mkdirSync(join(SITE_PUBLIC, "icons"), { recursive: true });
  await Promise.all(INSTALL_ICONS.map(({ path, size }) => renderInstallIcon(markSvg, path, size)));
  copyFileSync(ICO_SOURCE, join(SITE_PUBLIC, "favicon.ico"));
  console.log("brand:og copied favicon.ico");
}

if (import.meta.main) {
  await renderShareImages();
  await renderInstallIcons();
}
