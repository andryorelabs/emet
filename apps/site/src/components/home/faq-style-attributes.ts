import { createHash } from "node:crypto";

/**
 * The `style` attribute values Base UI renders on the server for the FAQ accordion
 * panels: the measured size variables start as `auto`, and the panel open at first
 * paint also drops its mount animation. Nothing else varies, so these are the only
 * values the hash-based CSP has to allow for the FAQ.
 */
export const FAQ_STYLE_ATTRIBUTES = [
  "--accordion-panel-height:auto;--accordion-panel-width:auto",
  "--accordion-panel-height:auto;--accordion-panel-width:auto;animation-name:none",
] as const;

/**
 * CSP hash sources (without quotes) for {@link FAQ_STYLE_ATTRIBUTES}, meant for
 * `style-src-attr` together with `'unsafe-hashes'`.
 */
export const FAQ_STYLE_ATTRIBUTE_HASHES: readonly `sha256-${string}`[] = FAQ_STYLE_ATTRIBUTES.map(
  (value) => `sha256-${createHash("sha256").update(value).digest("base64")}` as const,
);
