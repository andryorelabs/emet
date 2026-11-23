import type { HostContext, HostResult } from "./self-types";

/**
 * Installs the emet skills and hooks for Codex under `context.home`. A stub until the Codex
 * adapter lands: it writes nothing and reports the host as skipped.
 */
export function installCodexHost(context: HostContext): HostResult {
  const note = "the Codex adapter is not available yet; Codex skipped";
  context.log(`codex: ${note}`);
  return { host: "codex", status: "skipped", writes: [], notes: [note] };
}
