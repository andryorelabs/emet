import { createHash } from "node:crypto";

/**
 * The `style` attribute values the vendored shadcn `code-block` renders on the
 * server: `CodeBlockContent` resets its line counter from `startLine`, which the
 * home blocks leave at 1. Shiki's token colours are set on the client through the
 * CSSOM, which the CSP does not govern, so this is the only value to allow.
 */
export const CODE_BLOCK_STYLE_ATTRIBUTES = ["counter-reset:line 0"] as const;

/**
 * CSP hash sources (without quotes) for {@link CODE_BLOCK_STYLE_ATTRIBUTES}, meant
 * for `style-src-attr` together with `'unsafe-hashes'`.
 */
export const CODE_BLOCK_STYLE_ATTRIBUTE_HASHES: readonly `sha256-${string}`[] =
  CODE_BLOCK_STYLE_ATTRIBUTES.map(
    (value) => `sha256-${createHash("sha256").update(value).digest("base64")}` as const,
  );
