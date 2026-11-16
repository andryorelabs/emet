import { EmetError } from "./errors";

/** The one JSON object `--json` prints: a success carries `data`, a failure carries a structured `error`. */
export type Envelope =
  | { ok: true; data: unknown; error: null }
  | { ok: false; data: unknown; error: { code: string; message: string; fix: string } };

/** Wraps a command result as a success envelope. */
export function successEnvelope(data: unknown): Envelope {
  return { ok: true, data, error: null };
}

/**
 * Wraps a thrown value as a failure envelope. An `EmetError` keeps its code,
 * message and fix hint; anything else becomes an `internal` error.
 */
export function failureEnvelope(thrown: unknown, data: unknown = null): Envelope {
  if (thrown instanceof EmetError) {
    return {
      ok: false,
      data,
      error: { code: thrown.code, message: thrown.message, fix: thrown.fix },
    };
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return {
    ok: false,
    data,
    error: { code: "internal", message, fix: "Re-run with --verbose and report the stack." },
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).toSorted()) {
    const child: unknown = Reflect.get(value, key);
    sorted[key] = sortKeys(child);
  }
  return sorted;
}

/** Serializes `value` as indented JSON with object keys sorted at every depth, so output is stable. */
export function stringifySorted(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}
