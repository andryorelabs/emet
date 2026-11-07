/**
 * What an Expressive Code token `style` attribute carries: a light and a dark
 * colour, and optionally a font weight, font style and text decoration.
 */
export interface TokenStyle {
  light: string;
  dark: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
}

/**
 * A class name for a token style, with the CSS rule it needs.
 */
export interface TokenClass {
  name: string;
  rule: string;
}

const COLOUR = /^#[0-9a-fA-F]+$/;
const KEYWORD = /^[a-zA-Z0-9-]+$/;

/**
 * Reads the declarations of a token `style` attribute.
 * @param style - The attribute value, such as `--0:#fff;--1:#000;--0fw:bold;--1fw:bold`.
 * @returns The parsed style, or `null` when it holds anything else, so the
 *   caller leaves unknown styles untouched.
 */
export function parseTokenStyle(style: string): TokenStyle | null {
  const declarations = new Map<string, string>();
  for (const part of style.split(";")) {
    if (part.trim() === "") continue;
    const separator = part.indexOf(":");
    if (separator < 0) return null;
    declarations.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const allowed = new Set(["--0", "--1", "--0fw", "--1fw", "--0fs", "--1fs", "--0td", "--1td"]);
  if ([...declarations.keys()].some((name) => !allowed.has(name))) return null;
  const light = declarations.get("--0");
  const dark = declarations.get("--1");
  if (light === undefined || dark === undefined) return null;
  if (!COLOUR.test(light) || !COLOUR.test(dark)) return null;
  const fontWeight = sharedKeyword(declarations, "--0fw", "--1fw");
  const fontStyle = sharedKeyword(declarations, "--0fs", "--1fs");
  const textDecoration = sharedKeyword(declarations, "--0td", "--1td");
  if (fontWeight === null || fontStyle === null || textDecoration === null) return null;
  return {
    light,
    dark,
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
    ...(textDecoration === undefined ? {} : { textDecoration }),
  };
}

function sharedKeyword(
  declarations: ReadonlyMap<string, string>,
  lightName: string,
  darkName: string,
): string | undefined | null {
  const light = declarations.get(lightName);
  const dark = declarations.get(darkName);
  if (light === undefined && dark === undefined) return undefined;
  if (light !== dark || light === undefined || !KEYWORD.test(light)) return null;
  return light.toLowerCase();
}

/**
 * Turns a token style into classes: one colour pair class, plus a class each
 * for a font weight, a font style and a text decoration.
 * @param style - A parsed token style.
 * @returns The class names with their rules, colour class first.
 */
export function tokenClasses(style: TokenStyle): TokenClass[] {
  const light = style.light.slice(1).toLowerCase();
  const dark = style.dark.slice(1).toLowerCase();
  const classes: TokenClass[] = [
    {
      name: `tk-${light}-${dark}`,
      rule: `.tk-${light}-${dark}{color:light-dark(${style.light},${style.dark})}`,
    },
  ];
  if (style.fontWeight !== undefined) {
    classes.push({
      name: `tk-fw-${style.fontWeight}`,
      rule: `.tk-fw-${style.fontWeight}{font-weight:${style.fontWeight}}`,
    });
  }
  if (style.fontStyle !== undefined) {
    classes.push({
      name: `tk-fs-${style.fontStyle}`,
      rule: `.tk-fs-${style.fontStyle}{font-style:${style.fontStyle}}`,
    });
  }
  if (style.textDecoration !== undefined) {
    classes.push({
      name: `tk-td-${style.textDecoration}`,
      rule: `.tk-td-${style.textDecoration}{text-decoration:${style.textDecoration}}`,
    });
  }
  return classes;
}
