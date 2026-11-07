import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromHere = createRequire(import.meta.url);

const COMPONENTS_WITH_INLINE_SCRIPTS = [
  "@astrojs/starlight/components/SidebarPersister.astro",
  "@astrojs/starlight/components/Search.astro",
] as const;

const INLINE_SCRIPT = /<script is:inline[^>]*>(?<body>[\s\S]*?)<\/script>/g;

/**
 * CSP hash sources (without quotes) for the inline scripts Starlight ships in
 * the components the docs keep: the sidebar state persister and the search
 * button. Astro does not hash them into the policy itself, and they are read
 * from the installed package so a Starlight upgrade cannot leave them stale.
 * @returns One `sha256-...` source per `is:inline` script, without duplicates.
 */
export function collectStarlightInlineScriptHashes(): `sha256-${string}`[] {
  const hashes = COMPONENTS_WITH_INLINE_SCRIPTS.flatMap((specifier) => {
    const source = readFileSync(requireFromHere.resolve(specifier), "utf8");
    return source
      .matchAll(INLINE_SCRIPT)
      .map(
        ({ groups }) =>
          `sha256-${createHash("sha256")
            .update(groups?.["body"] ?? "")
            .digest("base64")}` as const,
      )
      .toArray();
  });
  return [...new Set(hashes)];
}

const SEARCH_COMPONENT = "@astrojs/starlight/components/Search.astro";
const STATIC_STYLE_ATTRIBUTE = /\sstyle="(?<value>[^"{}]+)"/g;
const ICON_SIZE = /<Icon\b[^>]*?\ssize="(?<size>[^"{}]+)"/g;
const DEFAULT_ICON_SIZE = "1em";
const MAX_TABLE_OF_CONTENTS_DEPTH = 5;

function sha256Source(value: string): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(value).digest("base64")}`;
}

function listAstroSources(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * CSP hash sources (without quotes) for the inline `style` attributes
 * Starlight renders in the components the docs keep: the literal attributes of
 * the search dialog, the table of contents `--depth` variable and the
 * `--sl-icon-size` variable of every icon size a Starlight component uses.
 * They belong in `style-src-attr` together with `'unsafe-hashes'`, and are read
 * from the installed package so a Starlight upgrade cannot leave them stale.
 * @returns One `sha256-...` source per distinct attribute value.
 */
export function collectStarlightInlineStyleHashes(): `sha256-${string}`[] {
  const searchPath = requireFromHere.resolve(SEARCH_COMPONENT);
  const searchValues = [...readFileSync(searchPath, "utf8").matchAll(STATIC_STYLE_ATTRIBUTE)].map(
    ({ groups }) => groups?.["value"] ?? "",
  );

  const distRoot = path.dirname(path.dirname(searchPath));
  const iconSizes = new Set([DEFAULT_ICON_SIZE]);
  for (const file of listAstroSources(distRoot)) {
    for (const { groups } of readFileSync(file, "utf8").matchAll(ICON_SIZE)) {
      iconSizes.add(groups?.["size"] ?? DEFAULT_ICON_SIZE);
    }
  }
  const iconValues = [...iconSizes].map((size) => `--sl-icon-size: ${size};`);

  const depthValues = Array.from(
    { length: MAX_TABLE_OF_CONTENTS_DEPTH + 1 },
    (_unused, depth) => `--depth: ${depth};`,
  );

  return [...new Set([...searchValues, ...iconValues, ...depthValues].map(sha256Source))];
}
