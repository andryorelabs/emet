import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { collectStarlightInlineStyleHashes } from "./starlight-inline-hashes";

const SITE_ROOT = path.resolve(import.meta.dir, "../..");
const STARTUP_ATTEMPTS = 90;
const STARTUP_TIMEOUT_MS = 90_000;
const DEV_SERVER_LOG = path.join(os.tmpdir(), `emet-site-dev-${process.pid}.log`);
const FETCH_ATTEMPTS = 60;
const FETCH_RETRY_DELAY_MS = 1_000;
const DEV_SERVER_URL = /http:\/\/localhost:(?<port>\d+)/;
const STYLE_ATTRIBUTE = /\sstyle="(?<value>[^"]*)"/g;
const DOCS_LINK = /href="(?<path>\/docs\/[^"#?]*)"/g;
const EXTRA_PAGES = ["/pt-br/docs/guide/getting-started/", "/ja/docs/guide/getting-started/"];

let devServer: Bun.Subprocess | undefined;
let origin = "";

/**
 * Polls the dev server log until Astro prints the address it listens on.
 * @param attemptsLeft - How many polls remain before giving up.
 * @returns The `http://localhost:<port>` origin.
 */
async function readOrigin(attemptsLeft = STARTUP_ATTEMPTS): Promise<string> {
  const log = await Bun.file(DEV_SERVER_LOG)
    .text()
    .catch(() => "");
  const port = DEV_SERVER_URL.exec(log)?.groups?.["port"];
  if (port) return `http://localhost:${port}`;
  if (attemptsLeft <= 1) throw new Error(`the Astro dev server did not start:\n${log}`);
  await Bun.sleep(FETCH_RETRY_DELAY_MS);
  return readOrigin(attemptsLeft - 1);
}

/**
 * Fetches a rendered page of the dev server, retrying while it is still warming up.
 * @param pagePath - The absolute path of the page.
 * @param attemptsLeft - How many tries remain before the failure is reported.
 * @returns The page HTML.
 */
async function fetchPage(pagePath: string, attemptsLeft = FETCH_ATTEMPTS): Promise<string> {
  const response = await fetch(`${origin}${pagePath}`).catch(() => undefined);
  const body = response?.status === 200 ? await response.text().catch(() => undefined) : undefined;
  if (body !== undefined) return body;
  if (attemptsLeft <= 1)
    throw new Error(`${pagePath} answered ${response?.status ?? "no response"}`);
  await Bun.sleep(FETCH_RETRY_DELAY_MS);
  return fetchPage(pagePath, attemptsLeft - 1);
}

/**
 * Hashes a `style` attribute value the way a CSP `style-src-attr` source does.
 * @param value - The attribute value, as it appears in the HTML.
 * @returns The `sha256-…` source.
 */
function hashOf(value: string): `sha256-${string}` {
  const decoded = value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  return `sha256-${createHash("sha256").update(decoded).digest("base64")}`;
}

beforeAll(async () => {
  devServer = Bun.spawn(["bun", "run", "astro", "dev", "--port", "0"], {
    cwd: SITE_ROOT,
    stdout: Bun.file(DEV_SERVER_LOG),
    stderr: Bun.file(DEV_SERVER_LOG),
  });
  origin = await readOrigin();
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  devServer?.kill();
  await Bun.spawn(["bun", "run", "astro", "dev", "stop"], { cwd: SITE_ROOT }).exited;
});

describe("inline style attributes on the docs pages", () => {
  test("every one is covered by the style-src-attr hashes", async () => {
    const entry = await fetchPage("/docs/guide/getting-started/");
    const linked = [...entry.matchAll(DOCS_LINK)].map(({ groups }) => groups?.["path"] ?? "");
    const pages = [...new Set([...linked, ...EXTRA_PAGES])].filter((page) => page.length > 0);
    expect(pages.length).toBeGreaterThan(3);

    const allowed = new Set<string>(collectStarlightInlineStyleHashes());
    const rendered = await Promise.all(
      pages.map(async (page) => ({ page, html: await fetchPage(page) })),
    );
    const uncovered = rendered.flatMap(({ page, html }) =>
      [...html.matchAll(STYLE_ATTRIBUTE)]
        .map(({ groups }) => groups?.["value"] ?? "")
        .filter((value) => !allowed.has(hashOf(value)))
        .map((value) => `${page}: ${value}`),
    );
    expect([...new Set(uncovered)]).toEqual([]);
  }, 180_000);
});
