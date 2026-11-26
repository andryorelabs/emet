/* oxlint-disable eslint/no-await-in-loop -- sequential on purpose: one page is scrolled and screenshotted step by step */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

import { diffRatio } from "./parity/diff";
import { SETTLE_MS, captureTargets, pairCaptures, scrollTarget, type Capture } from "./parity/plan";
import { buildReport, summaryLine, type MeasuredPair } from "./parity/report";

/**
 * Advisory visual parity check: screenshots each section of the prototype and
 * of the built Website at several scroll progresses and reports how much they
 * differ. It never fails; run it with `bun run parity` after `bun run build`.
 */

const siteRoot = join(import.meta.dir, "..");
const distDir = join(siteRoot, "dist");
const prototypeDir = join(siteRoot, "design", "prototype-v17");
const assetsDir = join(siteRoot, "src", "assets");
const outputDir = join(siteRoot, "e2e", ".output", "parity");
const prototypeImages = ["hero", "held", "bookend", "portrait", "source"];
const viewport = { width: 1440, height: 900 };
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

/** Copies the prototype and its images, which are not in the prototype folder, into a temporary directory. */
function stagePrototype(): string {
  const staged = mkdtempSync(join(tmpdir(), "emet-parity-"));
  cpSync(join(prototypeDir, "index.html"), join(staged, "index.html"));
  cpSync(join(prototypeDir, "parts"), join(staged, "parts"), { recursive: true });
  mkdirSync(join(staged, "img"));
  for (const name of prototypeImages) {
    const source = join(assetsDir, `${name}.webp`);
    if (existsSync(source)) cpSync(source, join(staged, "img", `${name}.webp`));
    else console.log(`parity: missing asset ${name}.webp, the prototype renders without it`);
  }
  return staged;
}

/** Scrolls to a capture's progress, waits for smooth scrolling to settle and saves a screenshot; false when the section is absent. */
async function takeCapture(page: Page, capture: Capture): Promise<boolean> {
  const target = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, height: box.height };
  }, capture.selector);
  if (target === null) return false;
  const top = scrollTarget(target.top, target.height, viewport.height, capture.progress);
  await page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: "instant" });
  }, top);
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: join(outputDir, capture.file) });
  return true;
}

/** Decodes a screenshot to a raw RGBA buffer of the comparison size. */
async function decode(file: string): Promise<Uint8Array> {
  const { data } = await sharp(join(outputDir, file))
    .resize(compareSize.width, compareSize.height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
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
  const browser = await chromium.launch();
  try {
    const captured: Capture[] = [];
    for (const side of ["prototype", "site"] as const) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(servers[side].origin, { waitUntil: "networkidle" });
      for (const capture of captureTargets().filter((entry) => entry.side === side)) {
        if (await takeCapture(page, capture)) captured.push(capture);
        else console.log(`parity: ${side} has no ${capture.selector}`);
      }
      await context.close();
    }
    const measured: MeasuredPair[] = [];
    for (const pair of pairCaptures(captured)) {
      const ratio = diffRatio(await decode(pair.prototype), await decode(pair.site));
      measured.push({ section: pair.section, progress: pair.progress, ratio });
    }
    const report = buildReport(measured);
    await Bun.write(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(summaryLine(report));
    console.log(`parity: screenshots and report.json in ${outputDir}`);
  } finally {
    await browser.close();
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
