import { buildCodeColorsCss } from "./code-classes";
import { loadLocalizedCatalog } from "./catalog";

/**
 * Id a component imports to get the token colour classes of the docs' code.
 */
const CODE_COLORS_MODULE = "virtual:emet-code-colors.css";

interface CodeColorsPlugin {
  name: string;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => Promise<string | undefined>;
}

const RESOLVED_ID = `\0${CODE_COLORS_MODULE}`;

/**
 * Vite plugin that serves `virtual:emet-code-colors.css`: the colour pairs of
 * every code block in the published docs, as classes. It replaces the inline
 * style attributes Expressive Code writes, which the site's CSP would drop.
 * @returns The plugin.
 */
export function codeColorsPlugin(): CodeColorsPlugin {
  return {
    name: "emet-code-colors",
    resolveId: (id) => (id === CODE_COLORS_MODULE ? RESOLVED_ID : undefined),
    load: (id) =>
      id === RESOLVED_ID
        ? buildCodeColorsCss(loadLocalizedCatalog().map((page) => page.body))
        : Promise.resolve(undefined),
  };
}
