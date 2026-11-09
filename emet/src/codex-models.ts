import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolveCodexConfig, type CodexModelChoice, type ForgeConfig } from "./config";

export type CodexRole =
  | "worker"
  | "workerOverride"
  | "reviewerMedium"
  | "reviewerHigh"
  | "triage"
  | "session";

export interface CodexModelResolution {
  /** Absent when no usable slug exists, so the caller omits `-m`. */
  readonly model?: string;
  readonly effort: string;
  readonly substituted?: { readonly from: string; readonly reason: string };
}

interface CacheEntry {
  readonly slug: string;
  readonly visibility: string;
  readonly efforts: readonly string[];
  readonly upgradeModel?: string;
}

const NEVER_SELECTED_EFFORTS: ReadonlySet<string> = new Set(["ultra"]);

/** Default location of Codex's models cache. */
function defaultCodexModelsCachePath(): string {
  const codexHome = process.env.CODEX_HOME;
  return join(
    codexHome && codexHome.length > 0 ? codexHome : join(homedir(), ".codex"),
    "models_cache.json",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function effortOf(level: unknown): string | undefined {
  if (typeof level === "string") return level;
  if (isRecord(level) && typeof level.effort === "string") return level.effort;
  return undefined;
}

function parseEntry(raw: unknown): CacheEntry | undefined {
  if (!isRecord(raw) || typeof raw.slug !== "string") return undefined;
  const levels = Array.isArray(raw.supported_reasoning_levels)
    ? raw.supported_reasoning_levels
    : [];
  const efforts = levels.map(effortOf).filter((effort): effort is string => effort !== undefined);
  const upgrade = isRecord(raw.upgrade) ? raw.upgrade.model : undefined;
  return {
    slug: raw.slug,
    visibility: typeof raw.visibility === "string" ? raw.visibility : "",
    efforts,
    ...(typeof upgrade === "string" && upgrade.length > 0 ? { upgradeModel: upgrade } : {}),
  };
}

/** Reads the models cache; `undefined` when the file is missing or unreadable. */
function readCache(cachePath: string): Map<string, CacheEntry> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return undefined;
  }
  const rawModels = isRecord(parsed) ? parsed.models : parsed;
  if (!Array.isArray(rawModels)) return undefined;
  const entries = new Map<string, CacheEntry>();
  for (const raw of rawModels) {
    const entry = parseEntry(raw);
    if (entry) entries.set(entry.slug, entry);
  }
  return entries;
}

function choiceFor(role: CodexRole, config: ForgeConfig): CodexModelChoice {
  const { models } = resolveCodexConfig(config);
  const choices: Record<CodexRole, CodexModelChoice> = {
    worker: models.worker,
    workerOverride: models.workerOverride,
    reviewerMedium: models.reviewer.medium,
    reviewerHigh: models.reviewer.high,
    triage: models.triage,
    session: models.session,
  };
  return choices[role];
}

function usable(entry: CacheEntry | undefined, effort: string): boolean {
  return (
    entry !== undefined &&
    entry.visibility === "list" &&
    !NEVER_SELECTED_EFFORTS.has(effort) &&
    entry.efforts.includes(effort)
  );
}

function unusableReason(entry: CacheEntry | undefined, effort: string): string {
  if (entry === undefined) return "not in the Codex models cache";
  if (entry.visibility !== "list") return `visibility is "${entry.visibility}"`;
  return `does not support effort ${effort}`;
}

/**
 * Picks the model and effort for a Codex role. Order: the configured slug,
 * then its `upgrade.model`, then the role's fallbacks, then no model at all.
 * A slug is usable only when the cache lists it with `visibility: "list"` and
 * the effort is among its `supported_reasoning_levels`. A missing cache keeps
 * the configured slug unchanged. Every substitution is reported.
 */
export function resolveCodexModel(
  role: CodexRole,
  config: ForgeConfig,
  cachePath: string = defaultCodexModelsCachePath(),
): CodexModelResolution {
  const choice = choiceFor(role, config);
  const effort = resolveCodexConfig(config).effort ?? choice.effort;
  const cache = readCache(cachePath);
  if (cache === undefined) return { model: choice.model, effort };

  const configured = cache.get(choice.model);
  if (usable(configured, effort)) return { model: choice.model, effort };
  const reason = unusableReason(configured, effort);

  const upgradeSlug = configured?.upgradeModel;
  if (upgradeSlug !== undefined && usable(cache.get(upgradeSlug), effort)) {
    return {
      model: upgradeSlug,
      effort,
      substituted: { from: choice.model, reason: `${reason}; upgraded to ${upgradeSlug}` },
    };
  }

  for (const slug of choice.fallback) {
    if (usable(cache.get(slug), effort)) {
      return {
        model: slug,
        effort,
        substituted: { from: choice.model, reason: `${reason}; fell back to ${slug}` },
      };
    }
  }

  return {
    effort,
    substituted: { from: choice.model, reason: `${reason}; no usable fallback, omitting -m` },
  };
}
