import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";
import { rewriteMarkdownLinks, splitLeadingHeading } from "./markdown";
import { REPOSITORY_ROOT, TRANSLATIONS_DIRECTORY } from "./paths";
import { findPublishedSourceById } from "./published";
import { parseChangelog, renderReleaseNotesMarkdown } from "./release-notes";

/**
 * How a locale's page relates to the English source.
 */
export type TranslationStatus = "translated" | "missing" | "stale";

/**
 * A translation file after parsing its frontmatter.
 */
interface ParsedTranslation {
  title: string;
  sourceHash: string;
  body: string;
  description?: string;
  seoTitle?: string;
}

/**
 * Thrown when a translation file cannot be parsed. Every other status is
 * data; only an unreadable file is an error.
 */
export class MalformedTranslationError extends Error {
  constructor(label: string, reason: string) {
    super(`${label}: ${reason}`);
    this.name = "MalformedTranslationError";
  }
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Hash of an English source file, stored in a translation's `sourceHash`
 * frontmatter. Line endings are normalised so the hash is stable across
 * platforms.
 * @param source - The full text of the English source file.
 * @returns The first 16 hex characters of its SHA-256.
 */
export function hashSource(source: string): string {
  return createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex").slice(0, 16);
}

function unquote(value: string): string {
  const quote = value[0];
  if (!(quote === '"' || quote === "'") || !value.endsWith(quote)) return value;
  const inner = value.slice(1, -1);
  return quote === "'" ? inner.replaceAll("''", "'") : inner;
}

/**
 * Parses a translation: simple `key: value` frontmatter with a required
 * `title` and `sourceHash` and an optional `description` and `seoTitle`, then
 * the Markdown body.
 * @param text - The file contents.
 * @param label - The file name, used in error messages.
 * @returns The parsed translation.
 * @throws {MalformedTranslationError} When the frontmatter is missing or
 * incomplete.
 */
function parseTranslation(text: string, label: string): ParsedTranslation {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new MalformedTranslationError(label, "missing frontmatter");
  const fields = new Map<string, string>();
  let continuedKey: string | undefined;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (continuedKey !== undefined && /^\s/.test(line)) {
      fields.set(continuedKey, `${fields.get(continuedKey) ?? ""} ${line.trim()}`.trim());
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new MalformedTranslationError(label, `invalid line "${line}"`);
    }
    continuedKey = line.slice(0, separator).trim();
    fields.set(continuedKey, line.slice(separator + 1).trim());
  }
  for (const [key, value] of fields) fields.set(key, unquote(value));
  const title = fields.get("title");
  if (!title) throw new MalformedTranslationError(label, "missing title");
  const sourceHash = fields.get("sourceHash");
  if (!sourceHash) throw new MalformedTranslationError(label, "missing sourceHash");
  const description = fields.get("description");
  const seoTitle = fields.get("seoTitle");
  return {
    title,
    sourceHash,
    body: (match[2] ?? "").replace(/^(?:[ \t]*\r?\n)+/, ""),
    ...(description && { description }),
    ...(seoTitle && { seoTitle }),
  };
}

/**
 * Classifies a locale's page against the current English source.
 * @param translation - The parsed translation, or undefined when none exists.
 * @param englishHash - The current hash of the English source.
 * @returns `missing` without a file, `stale` when its hash no longer matches,
 * otherwise `translated`.
 */
function classifyTranslation(
  translation: Pick<ParsedTranslation, "sourceHash"> | undefined,
  englishHash: string,
): TranslationStatus {
  if (!translation) return "missing";
  return translation.sourceHash === englishHash ? "translated" : "stale";
}

/**
 * Reads a locale's translation file of a page id, or `undefined` when that
 * locale has none.
 */
export type TranslationReader = (locale: Locale, id: string) => string | undefined;

/**
 * Reads an English source file by repository path.
 */
export type SourceReader = (sourcePath: string) => string;

/**
 * Reads a file below the repository root.
 * @param sourcePath - Path relative to the repository root, using `/`.
 * @returns The file's UTF-8 text.
 */
export function readRepositorySource(sourcePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, sourcePath), "utf8");
}

/**
 * Reads `src/content/translations/<locale>/<id>.md`.
 * @param locale - A non-English locale.
 * @param id - A published page id.
 * @returns The file's text, or `undefined` when it does not exist.
 */
export function readTranslationFile(locale: Locale, id: string): string | undefined {
  const file = path.join(TRANSLATIONS_DIRECTORY, locale, `${id}.md`);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/**
 * A page's text for a locale and whether it is a current translation.
 */
export interface LoadedTranslation {
  /**
   * The translated body when `status` is `translated`, the English body
   * otherwise. Links are rewritten to site routes.
   */
  body: string;
  status: TranslationStatus;
  /**
   * Translated title, description and SEO title; present only when `status`
   * is `translated`.
   */
  fields?: { title: string; description: string | undefined; seoTitle: string | undefined };
}

function englishBody(sourceId: string, markdown: string, locale: Locale): string {
  const source = findPublishedSourceById(sourceId);
  if (!source) throw new Error(`"${sourceId}" is not a published page`);
  const text =
    source.kind === "changelog"
      ? renderReleaseNotesMarkdown(parseChangelog(markdown))
      : splitLeadingHeading(markdown).body;
  return rewriteMarkdownLinks(text, { sourcePath: source.sourcePath, locale });
}

/**
 * Looks up a locale's page. A translation whose `sourceHash` matches the
 * English source is used; a missing or stale one returns the English text, so
 * no locale ever lacks a page.
 * @param locale - The locale to load.
 * @param id - A published page id such as `guide/fleet`.
 * @param readers - Where to read the English source and the translation.
 * Default to the repository checkout and the site's translations folder.
 * @returns The body and its status.
 * @throws {MalformedTranslationError} When the translation is unusable.
 * @throws {Error} When `id` is not published.
 */
export function loadTranslation(
  locale: Locale,
  id: string,
  readers: { readSource?: SourceReader; readTranslation?: TranslationReader } = {},
): LoadedTranslation {
  const { readSource = readRepositorySource, readTranslation = readTranslationFile } = readers;
  const source = findPublishedSourceById(id);
  if (!source) throw new Error(`"${id}" is not a published page`);
  const english = readSource(source.sourcePath);
  if (locale === DEFAULT_LOCALE) {
    return { body: englishBody(id, english, locale), status: "translated" };
  }
  const text = readTranslation(locale, id);
  const translation = text === undefined ? undefined : parseTranslation(text, `${locale}/${id}.md`);
  const status = classifyTranslation(translation, hashSource(english));
  if (translation && status === "translated") {
    const { title, description, seoTitle } = translation;
    return {
      body: rewriteMarkdownLinks(translation.body, { sourcePath: source.sourcePath, locale }),
      status,
      fields: { title, description, seoTitle },
    };
  }
  return { body: englishBody(id, english, locale), status };
}
