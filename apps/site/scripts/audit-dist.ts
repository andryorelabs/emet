import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Audits the built Website for requests that leave its origin: every resource a
 * page loads (scripts, stylesheets, images, frames, media, resource hints, CSS
 * `url()` and inline-script imports) must be same-origin or on the allow list.
 * Outbound `<a>` links and `canonical`/`alternate` links are not requests.
 * It also audits the Islands: a page with no island must not reference the
 * React runtime, and every executable inline script must have its hash in the
 * page's `script-src` policy.
 * Usage: `bun scripts/audit-dist.ts <dist-directory>`.
 */

/** The Website's own origin, which absolute URLs in the build may name. */
export const SITE_ORIGIN = "https://emet.andryore.dev";

/**
 * The origins the built site may load from: only its own. The docs' repository
 * images are copied into the build under `/repo-assets/`.
 */
export const ALLOWED_ORIGINS: readonly string[] = [SITE_ORIGIN];

/** What an audit found: a third-party origin, a React runtime reference on an island-free page, or an inline script with no CSP hash. */
export type AuditFindingKind = "third-party-origin" | "react-runtime" | "inline-script";

/** One problem, with the page (relative to the dist directory) it was found on and a detail: the origin, the runtime path or the script hash. */
export interface AuditFinding {
  readonly file: string;
  readonly kind: AuditFindingKind;
  readonly detail: string;
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
      kind: "third-party-origin" as const,
      detail: origin,
    })),
  );
}

const ISLAND_PATTERN = /<astro-island\b/i;
const REACT_RUNTIME_PATTERN = /\/_astro\/(?:client|react|react-dom|jsx-runtime)\.[\w-]+\.js/g;
const CSP_META_PATTERN = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;
const CSP_HASH_PATTERN = /'(sha(?:256|384|512)-[A-Za-z0-9+/=]+)'/g;
const NON_EXECUTABLE_SCRIPT_TYPES = new Set([
  "application/ld+json",
  "application/json",
  "importmap",
  "speculationrules",
]);

/**
 * Returns the CSP source token (`sha256-<base64>`) that allows an inline script with this exact body.
 */
export function inlineScriptHash(body: string): string {
  return `sha256-${createHash("sha256").update(body).digest("base64")}`;
}

/**
 * Lists the hash tokens a page's `<meta>` policy puts in its `script-src` directive.
 */
function scriptSourceHashes(html: string): ReadonlySet<string> {
  const meta = CSP_META_PATTERN.exec(html)?.[0];
  const content =
    meta === undefined ? undefined : parseAttributes(meta.slice(5, -1)).get("content");
  const directive = content
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("script-src "));
  if (directive === undefined) {
    return new Set();
  }
  return new Set([...directive.matchAll(CSP_HASH_PATTERN)].map((match) => match[1] ?? ""));
}

/**
 * Lists the bodies of the executable inline scripts of a page.
 */
function inlineScriptBodies(html: string): readonly string[] {
  return [...html.matchAll(RAW_TEXT_PATTERN)].flatMap((match) => {
    const attributes = parseAttributes(match[2] ?? "");
    const type = (attributes.get("type") ?? "").toLowerCase();
    const executable = match[1]?.toLowerCase() === "script" && !attributes.has("src");
    return executable && !NON_EXECUTABLE_SCRIPT_TYPES.has(type) ? [match[3] ?? ""] : [];
  });
}

/**
 * Audits the Islands of a built site: a page with no `astro-island` must not reference the React runtime, and every executable inline script must have its hash in the page's `script-src`.
 */
export function auditIslands(directory: string): readonly AuditFinding[] {
  return htmlFiles(directory).flatMap((path) => {
    const html = stripComments(readFileSync(join(directory, path), "utf8"));
    const file = relative(directory, join(directory, path));
    const findings: AuditFinding[] = [];
    if (!ISLAND_PATTERN.test(html.replaceAll(RAW_TEXT_PATTERN, ""))) {
      const references = [...new Set(html.match(REACT_RUNTIME_PATTERN) ?? [])].toSorted();
      findings.push(
        ...references.map((detail) => ({ file, kind: "react-runtime" as const, detail })),
      );
    }
    const allowed = scriptSourceHashes(html);
    for (const body of inlineScriptBodies(html)) {
      const hash = inlineScriptHash(body);
      if (!allowed.has(hash)) {
        findings.push({ file, kind: "inline-script", detail: hash });
      }
    }
    return findings;
  });
}

/**
 * Formats a finding as one line of the report.
 */
function describeFinding(finding: AuditFinding): string {
  const file = finding.file.split(sep).join("/");
  const messages: Readonly<Record<AuditFindingKind, string>> = {
    "third-party-origin": `loads ${finding.detail}`,
    "react-runtime": `has no island but references the React runtime ${finding.detail}`,
    "inline-script": `inline script ${finding.detail} has no CSP hash`,
  };
  return `${file}: ${messages[finding.kind]}`;
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
  const findings = [...auditDist(directory, ALLOWED_ORIGINS), ...auditIslands(directory)];
  for (const finding of findings) {
    print(describeFinding(finding));
  }
  if (findings.length > 0) {
    print(`${findings.length} finding(s) in the built site`);
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), console.error.bind(console));
}
