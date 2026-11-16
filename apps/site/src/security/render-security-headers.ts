import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type BuiltPage, cspHeader, renderSecurityHeaders, siteScriptHashes } from "./csp";

function* readPages(distDirectory: string): Generator<BuiltPage> {
  const files = readdirSync(distDirectory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .toSorted();
  for (const file of files) {
    yield { file, html: readFileSync(path.join(distDirectory, file), "utf8") };
  }
}

/**
 * Hashes the inline scripts of every page in `dist` and renders the nginx
 * header snippet from its template. Run by the image build after `astro build`.
 * @param distDirectory - The built site.
 * @param templatePath - `docker/security-headers.conf`.
 * @param outputPath - Where the rendered snippet is written.
 * @returns The number of inline script hashes in the policy.
 */
export function writeSecurityHeaders(
  distDirectory: string,
  templatePath: string,
  outputPath: string,
): number {
  const hashes = siteScriptHashes(readPages(distDirectory));
  const snippet = renderSecurityHeaders(readFileSync(templatePath, "utf8"), cspHeader(hashes));
  writeFileSync(outputPath, snippet);
  return hashes.length;
}

/**
 * The command line: `render-security-headers <dist> <template> <output>`.
 * @param argv - The arguments after the script path.
 * @returns The summary line to print.
 * @throws {Error} When an argument is missing.
 */
export function renderSecurityHeadersCli(argv: readonly string[]): string {
  const [distDirectory, templatePath, outputPath] = argv;
  if (distDirectory === undefined || templatePath === undefined || outputPath === undefined) {
    throw new Error("Usage: render-security-headers <dist> <template> <output>");
  }
  const count = writeSecurityHeaders(distDirectory, templatePath, outputPath);
  return `CSP: ${String(count)} inline script hashes rendered into ${outputPath}`;
}

if (import.meta.main) console.log(renderSecurityHeadersCli(process.argv.slice(2)));
