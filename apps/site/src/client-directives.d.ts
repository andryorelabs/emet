declare module "astro" {
  interface AstroClientDirectives {
    "client:interaction"?: boolean;
  }
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- makes this file a module so the declaration above augments astro instead of replacing it
export {};
