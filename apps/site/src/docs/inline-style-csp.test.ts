import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import path from "node:path";

import { collectStarlightInlineStyleHashes } from "./starlight-inline-hashes";

const SITE_ROOT = path.resolve(import.meta.dir, "../..");
const STARTUP_TIMEOUT_MS = 90_000;
const DEV_SERVER_URL = /http:\/\/localhost:(?<port>\d+)/;
const STYLE_ATTRIBUTE = /\sstyle="(?<value>[^"]*)"/g;
const DOCS_LINK = /href="(?<path>\/docs\/[^"#?]*)"/g;
const EXTRA_PAGES = ["/pt-br/docs/guide/getting-started/", "/ja/docs/guide/getting-started/"];

let devServer: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
let origin = "";

/**
 * Resolves with the dev server origin once Astro prints it.
 * @param stream - A readable stream of the dev server output.
 * @returns The `http://localhost:<port>` origin.
 */
async function readOrigin(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const port = DEV_SERVER_URL.exec(decoder.decode(chunk))?.groups?.["port"];
    if (port) return `http://localhost:${port}`;
  }
  throw new Error("the Astro dev server exited before it printed its address");
}

/**
 * Fetches a rendered page of the dev server.
 * @param pagePath - The absolute path of the page.
 * @returns The page HTML.
 */
async function fetchPage(pagePath: string): Promise<string> {
  const response = await fetch(`${origin}${pagePath}`);
  expect(response.status).toBe(200);
  return response.text();
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
    stdout: "pipe",
    stderr: "pipe",
  });
  origin = await Promise.any([
    readOrigin(devServer.stdout),
    readOrigin(devServer.stderr),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("the Astro dev server did not start")), STARTUP_TIMEOUT_MS),
    ),
  ]);
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
  }, 120_000);
});
