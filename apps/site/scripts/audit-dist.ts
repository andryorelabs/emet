import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Audits the built Website for requests that leave its origin: every resource a
 * page loads (scripts, stylesheets, images, frames, media, resource hints, CSS
 * `url()` and inline-script imports) must be same-origin or on the allow list.
 * Outbound `<a>` links and `canonical`/`alternate` links are not requests.
 * Usage: `bun scripts/audit-dist.ts <dist-directory>`.
 */

/** The Website's own origin, which absolute URLs in the build may name. */
export const SITE_ORIGIN = "https://emet.andryore.dev";

/**
 * The origins the built site may load from: only its own. The docs' repository
 * images are copied into the build under `/repo-assets/`.
 */
export const ALLOWED_ORIGINS: readonly string[] = [SITE_ORIGIN];

/** A third-party origin and the page, relative to the dist directory, that references it. */
export interface AuditFinding {
  readonly file: string;
  readonly origin: string;
}

const PLACEHOLDER_BASE = "https://same-origin.invalid/";
const LOADING_LINK_RELS = new Set([
  "stylesheet",
  "icon",
  "shortcut",
  "apple-touch-icon",
  "mask-icon",
  "manifest",
  "preload",
  "modulepreload",
  "prefetch",
  "preconnect",
  "dns-prefetch",
  "prerender",
]);
const URL_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  script: ["src"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  iframe: ["src"],
  frame: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  embed: ["src"],
  object: ["data"],
  input: ["src"],
  image: ["href"],
  use: ["href"],
};
const SRCSET_ATTRIBUTES = new Set(["srcset"]);
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const RAW_TEXT_PATTERN = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const TAG_PATTERN = /<([a-z][\w-]*)\b([^>]*)>/gi;
const ATTRIBUTE_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const CSS_URL_PATTERN = /url\(\s*["']?([^"')\s]+)|@import\s+["']([^"']+)/g;
const SCRIPT_URL_PATTERN = /\b(?:import|from|fetch)\s*\(?\s*["'`]((?:https?:)?\/\/[^"'`\s]+)/g;

/**
 * Parses a tag's attribute text into a lower-cased name to value map.
 */
function parseAttributes(text: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const match of text.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase();
    if (name !== undefined) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
  }
  return attributes;
}

/**
 * Returns the http(s) origin a URL loads from, or `undefined` for a relative, same-origin or non-http URL.
 */
function originOf(reference: string): string | undefined {
  const trimmed = reference.trim();
  if (!URL.canParse(trimmed, PLACEHOLDER_BASE)) {
    return undefined;
  }
  const url = new URL(trimmed, PLACEHOLDER_BASE);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  return url.origin === new URL(PLACEHOLDER_BASE).origin ? undefined : url.origin;
}

/**
 * Lists the URLs of one attribute, splitting a `srcset` into its candidates.
 */
function attributeUrls(name: string, value: string): readonly string[] {
  if (!SRCSET_ATTRIBUTES.has(name)) {
    return [value];
  }
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((candidate) => candidate !== "");
}

/**
 * Lists every URL a tag loads.
 */
function tagUrls(tag: string, attributes: ReadonlyMap<string, string>): readonly string[] {
  const style = attributes.get("style");
  const styleUrls = style === undefined ? [] : cssUrls(style);
  if (tag === "link") {
    const rels = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = attributes.get("href");
    const loads = href !== undefined && rels.some((rel) => LOADING_LINK_RELS.has(rel));
    return loads ? [href, ...styleUrls] : styleUrls;
  }
  const names = URL_ATTRIBUTES[tag] ?? [];
  return names
    .flatMap((name) => {
      const value = attributes.get(name);
      return value === undefined ? [] : attributeUrls(name, value);
    })
    .concat(styleUrls);
}

/**
 * Lists the URLs of `url()` and `@import` in a stylesheet or style attribute.
 */
function cssUrls(css: string): readonly string[] {
  return [...css.matchAll(CSS_URL_PATTERN)].map((match) => match[1] ?? match[2] ?? "");
}

/**
 * Lists the absolute URLs an inline script imports or fetches.
 */
function scriptUrls(body: string): readonly string[] {
  return [...body.matchAll(SCRIPT_URL_PATTERN)].map((match) => match[1] ?? "");
}

/**
 * Removes HTML comments until none are left, so a removal cannot join the text around it into a new comment.
 */
function stripComments(html: string): string {
  let current = html;
  let previous: string;
  do {
    previous = current;
    current = previous.replaceAll(COMMENT_PATTERN, "");
  } while (current !== previous);
  return current;
}

/**
 * Returns the sorted, unique origins outside `allow` that a page's HTML loads resources from.
 */
export function thirdPartyOrigins(html: string, allow: readonly string[]): readonly string[] {
  const urls: string[] = [];
  const withoutComments = stripComments(html);
  const withoutBodies = withoutComments.replaceAll(
    RAW_TEXT_PATTERN,
    (_whole, tag: string, attributes: string, body: string) => {
      urls.push(...(tag.toLowerCase() === "style" ? cssUrls(body) : scriptUrls(body)));
      return `<${tag}${attributes}>`;
    },
  );
  for (const match of withoutBodies.matchAll(TAG_PATTERN)) {
    const tag = (match[1] ?? "").toLowerCase();
    urls.push(...tagUrls(tag, parseAttributes(match[2] ?? "")));
  }
  const origins = urls
    .map((url) => originOf(url))
    .filter((origin): origin is string => origin !== undefined && !allow.includes(origin));
  return [...new Set(origins)].toSorted();
}

/**
 * Lists every `.html` file under `directory`, recursively.
 */
function htmlFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".html"))
    .toSorted();
}

/**
 * Audits every page of a built site and returns one finding per page and third-party origin.
 */
export function auditDist(directory: string, allow: readonly string[]): readonly AuditFinding[] {
  return htmlFiles(directory).flatMap((path) =>
    thirdPartyOrigins(readFileSync(join(directory, path), "utf8"), allow).map((origin) => ({
      file: relative(directory, join(directory, path)),
      origin,
    })),
  );
}

/**
 * Runs the audit over `argv[0]`, printing each finding, and returns the exit code: 0 clean, 1 findings, 2 usage or no dist.
 */
export function main(argv: readonly string[], print: (line: string) => void): number {
  const directory = argv[0];
  if (directory === undefined) {
    print("usage: bun scripts/audit-dist.ts <dist-directory>");
    return 2;
  }
  if (!existsSync(directory)) {
    print(`${directory} does not exist; build the site first`);
    return 2;
  }
  const findings = auditDist(directory, ALLOWED_ORIGINS);
  for (const { file, origin } of findings) {
    print(`${file.split(sep).join("/")}: loads ${origin}`);
  }
  if (findings.length > 0) {
    print(`${findings.length} third-party origin reference(s) in the built site`);
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), console.error.bind(console));
}
