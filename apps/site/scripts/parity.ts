/* oxlint-disable eslint/no-await-in-loop -- sequential on purpose: one page is scrolled and screenshotted step by step */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, normalize } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { diffRatio } from "./parity/diff";
import {
  VARIANTS,
  captureTargets,
  commonHeight,
  contentBox,
  heightAdjustedRatio,
  pairCaptures,
  scrollTarget,
  sectionClip,
  settleMs,
  variantWidth,
  type Capture,
  type Variant,
} from "./parity/plan";
import { buildReport, summaryLine, type MeasuredPair } from "./parity/report";

/**
 * Advisory visual parity check: screenshots each section of the prototype and
 * of the built Website at several scroll progresses, on desktop and mobile, in
 * light and dark, with motion and with reduced motion, and reports how much
 * they differ. It never fails; run it with `bun run parity` after `bun run build`.
 */

const siteRoot = join(import.meta.dir, "..");
const distDir = join(siteRoot, "dist");
const prototypeDir = join(siteRoot, "design", "prototype-v17");
const assetDirs = [join(siteRoot, "src", "assets"), join(siteRoot, "design", "pictures")];
const outputDir = join(siteRoot, "e2e", ".output", "parity");
const prototypeImages = ["hero", "held", "bookend", "portrait", "source"];
const compareSize = { width: 720, height: 450 };

/** Serves a directory over HTTP on a free 127.0.0.1 port. */
function serveDirectory(root: string): { readonly origin: string; readonly stop: () => void } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const candidates = [relative, join(relative, "index.html")];
      for (const candidate of candidates) {
        const file = Bun.file(join(root, candidate));
        if (candidate !== "/" && (await file.exists()) && file.size > 0) return new Response(file);
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { origin: `http://127.0.0.1:${server.port}`, stop: () => void server.stop(true) };
}

/** Copies the prototype and its images, which are not in the prototype folder, into the git-ignored parity output directory. */
function stagePrototype(): string {
  const staged = join(outputDir, ".prototype");
  mkdirSync(staged, { recursive: true });
  cpSync(join(prototypeDir, "index.html"), join(staged, "index.html"));
  cpSync(join(prototypeDir, "parts"), join(staged, "parts"), { recursive: true });
  mkdirSync(join(staged, "img"));
  for (const name of prototypeImages) {
    const source = assetDirs
      .map((dir) => join(dir, `${name}.webp`))
      .find((file) => existsSync(file));
    if (source !== undefined) cpSync(source, join(staged, "img", `${name}.webp`));
    else console.log(`parity: missing asset ${name}.webp, the prototype renders without it`);
  }
  return staged;
}

/** Scrolls to a capture's progress, waits for smooth scrolling to settle and saves a screenshot clipped to the section's own box, or to its content box for padded sections so both sides frame the same inner box (see `sectionClip`, `contentBox`); false when the section is absent. */
async function takeCapture(page: Page, capture: Capture, variant: Variant): Promise<boolean> {
  const target = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, height: box.height };
  }, capture.selector);
  if (target === null) return false;
  const top = scrollTarget(target.top, target.height, variant.viewport.height, capture.progress);
  await page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: "instant" });
  }, top);
  await page.waitForTimeout(settleMs(variant));
  const live = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: box.top,
      height: box.height,
      paddingTop: Number.parseFloat(style.paddingTop),
      paddingBottom: Number.parseFloat(style.paddingBottom),
      borderTop: Number.parseFloat(style.borderTopWidth),
      borderBottom: Number.parseFloat(style.borderBottomWidth),
    };
  }, capture.selector);
  const framed = live === null ? null : capture.box === "content" ? contentBox(live) : live;
  const clip = framed === null ? null : sectionClip(framed.top, framed.height, variant.viewport);
  if (clip === null) return false;
  await page.screenshot({ path: join(outputDir, capture.file), clip });
  return true;
}

/** The pixel height of a saved screenshot. */
async function heightOf(file: string): Promise<number> {
  const { height } = await sharp(join(outputDir, file)).metadata();
  return height;
}

/** Decodes the top `height` pixel rows of a screenshot to a raw RGBA buffer of the comparison size. */
async function decode(file: string, width: number, height: number): Promise<Uint8Array> {
  const { data } = await sharp(join(outputDir, file))
    .extract({ left: 0, top: 0, width, height })
    .resize(compareSize.width, compareSize.height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

/** Captures every variant on both sides, one browser context at a time, and returns the captures that were taken. */
async function captureAll(
  browser: Browser,
  origins: Record<"prototype" | "site", string>,
): Promise<Capture[]> {
  const captured: Capture[] = [];
  for (const variant of VARIANTS) {
    for (const side of ["prototype", "site"] as const) {
      const context = await browser.newContext({
        viewport: variant.viewport,
        colorScheme: variant.scheme,
        reducedMotion: variant.motion === "reduced" ? "reduce" : "no-preference",
      });
      const page = await context.newPage();
      await page.goto(origins[side], { waitUntil: "networkidle" });
      for (const capture of captureTargets(variant.id).filter((entry) => entry.side === side)) {
        if (await takeCapture(page, capture, variant)) captured.push(capture);
        else console.log(`parity: ${side} has no ${capture.selector} (${variant.id})`);
      }
      await context.close();
    }
  }
  return captured;
}

async function main(): Promise<void> {
  if (!existsSync(join(distDir, "index.html"))) {
    console.log("parity: apps/site/dist is missing; run `bun run build` first. Skipping.");
    return;
  }
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  const stagedPrototype = stagePrototype();
  const servers = { prototype: serveDirectory(stagedPrototype), site: serveDirectory(distDir) };
  try {
    const browser = await chromium.launch().catch((error: unknown) => {
      console.log(
        `parity: could not launch Chromium (run \`bunx playwright install chromium\`), advisory only: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      return undefined;
    });
    if (browser === undefined) return;
    try {
      const captured = await captureAll(browser, {
        prototype: servers.prototype.origin,
        site: servers.site.origin,
      });
      const expected = VARIANTS.flatMap((variant) => captureTargets(variant.id));
      const { pairs, missing } = pairCaptures(expected, captured);
      const measured: MeasuredPair[] = [];
      for (const pair of pairs) {
        const prototypeHeight = await heightOf(pair.prototype);
        const siteHeight = await heightOf(pair.site);
        const height = commonHeight(prototypeHeight, siteHeight);
        const width = variantWidth(pair.variant);
        const sharedRatio = diffRatio(
          await decode(pair.prototype, width, height),
          await decode(pair.site, width, height),
        );
        const ratio = heightAdjustedRatio(sharedRatio, prototypeHeight, siteHeight);
        measured.push({
          variant: pair.variant,
          section: pair.section,
          progress: pair.progress,
          ratio,
          prototypeHeight,
          siteHeight,
        });
      }
      const report = buildReport(measured, missing);
      await Bun.write(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
      console.log(summaryLine(report));
      console.log(`parity: screenshots and report.json in ${outputDir}`);
    } finally {
      await browser.close();
    }
  } finally {
    servers.prototype.stop();
    servers.site.stop();
    rmSync(stagedPrototype, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.log(
    `parity: failed, advisory only: ${error instanceof Error ? error.message : String(error)}`,
  );
});
