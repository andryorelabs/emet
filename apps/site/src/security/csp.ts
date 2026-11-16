import { createHash } from "node:crypto";

/**
 * Token in `docker/security-headers.conf` that the image build replaces with
 * the rendered Content-Security-Policy.
 */
export const CSP_PLACEHOLDER = "__CONTENT_SECURITY_POLICY__";

/**
 * A built HTML page and its path inside `dist`.
 */
export interface BuiltPage {
  file: string;
  html: string;
}

const OPENING_TAG = /<([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const TYPE_ATTRIBUTE = /\btype\s*=\s*["']?([^"'\s>]*)/i;
const SRC_ATTRIBUTE = /\ssrc\s*=/i;
const EXECUTABLE_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);
const META_POLICY = /<meta http-equiv="content-security-policy" content="(?<policy>[^"]*)"[^>]*>/i;
const HASH_SOURCE = /'sha(?:256|384|512)-[^']+'/g;

function sha256Source(body: string): string {
  return `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
}

function isExecutableInline(attributes: string): boolean {
  if (SRC_ATTRIBUTE.test(attributes)) return false;
  const type = TYPE_ATTRIBUTE.exec(attributes)?.[1] ?? "";
  return EXECUTABLE_TYPES.has(type.toLowerCase());
}

/**
 * SHA-256 CSP sources for every executable inline script of a page. Script
 * bodies and attribute values are skipped as opaque text, so markup quoted
 * inside them is never mistaken for a tag.
 * @param html - A built page.
 * @returns One quoted hash source per inline script, in document order.
 */
export function scriptHashes(html: string): readonly string[] {
  const tag = new RegExp(OPENING_TAG.source, "gi");
  const hashes: string[] = [];
  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    if (match[1]?.toLowerCase() !== "script") continue;
    const end = html.indexOf("</script", tag.lastIndex);
    const bodyEnd = end === -1 ? html.length : end;
    const body = html.slice(tag.lastIndex, bodyEnd);
    tag.lastIndex = bodyEnd;
    if (isExecutableInline(match[2] ?? "")) hashes.push(sha256Source(body));
  }
  return hashes;
}

/**
 * The hash sources Astro declared in the `script-src` directive of a page's
 * CSP meta tag.
 * @param html - A built page.
 * @returns The quoted hash sources, empty without a meta policy.
 */
export function declaredScriptHashes(html: string): readonly string[] {
  const policy = META_POLICY.exec(html)?.groups?.policy ?? "";
  const scriptDirective = policy
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("script-src "));
  return scriptDirective?.match(HASH_SOURCE) ?? [];
}

/**
 * Every inline script hash of the site, after checking each against the hashes
 * its own page declares: the header and the meta policy must agree.
 * @param pages - The built pages.
 * @returns The sorted, de-duplicated hash sources.
 * @throws {Error} When an inline script has no declared hash, naming each page and hash.
 */
export function siteScriptHashes(pages: Iterable<BuiltPage>): readonly string[] {
  const hashes = new Set<string>();
  const unhashed: string[] = [];
  for (const { file, html } of pages) {
    const declared = new Set(declaredScriptHashes(html));
    for (const hash of scriptHashes(html)) {
      hashes.add(hash);
      if (!declared.has(hash)) unhashed.push(`${file} ${hash}`);
    }
  }
  if (unhashed.length > 0) {
    throw new Error(`Inline scripts missing from the CSP:\n${unhashed.join("\n")}`);
  }
  return [...hashes].toSorted();
}

/**
 * The Content-Security-Policy header value. The per-page meta policy Astro
 * emits stays in force beside it; the header adds what a meta tag cannot carry
 * (`frame-ancestors`) and pins scripts to the site's own inline hashes.
 * @param hashes - Quoted hash sources of every inline script.
 * @returns The policy.
 * @throws {Error} When no hashes are given, which would block every inline script.
 */
export function cspHeader(hashes: readonly string[]): string {
  if (hashes.length === 0) throw new Error("No inline script hashes found in the built pages");
  const sources = [...new Set(hashes)].toSorted().join(" ");
  return [
    `script-src 'self' 'wasm-unsafe-eval' ${sources}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Fills the nginx header snippet with the policy.
 * @param template - `docker/security-headers.conf`.
 * @param policy - The rendered policy.
 * @returns The snippet nginx includes.
 * @throws {Error} When the template has no placeholder.
 */
export function renderSecurityHeaders(template: string, policy: string): string {
  if (!template.includes(CSP_PLACEHOLDER)) {
    throw new Error(`The header template has no ${CSP_PLACEHOLDER}`);
  }
  return template.replace(CSP_PLACEHOLDER, () => policy);
}
