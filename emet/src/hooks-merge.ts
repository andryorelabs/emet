export type JsonObject = Record<string, unknown>;

const PRETOOLUSE_EVENT = "PreToolUse";
const CLAUDE_PLUGIN_BIN = '"${CLAUDE_PLUGIN_ROOT}/bin/emet"';
const CLAUDE_DATA_DIR_ARGUMENT = ' --data-dir "${CLAUDE_PLUGIN_DATA}"';
const CODEX_BARE_BIN = /(^|\s)emet(?=\s)/;
const EMET_HOOK_COMMAND =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=\S+ )*(?:"[^"]*\/emet"|(?:\S*\/)?emet) (?:guard|setup --notice|whats-new --hook|self update --auto)(?: |$)/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function quote(emetBin: string): string {
  return `"${emetBin}"`;
}

interface RewrittenHook {
  hook: JsonObject;
  command: string;
}

interface RewrittenGroup {
  group: JsonObject;
  matcher: string | undefined;
  hooks: RewrittenHook[];
}

function hookCommand(hook: unknown): string | undefined {
  return isObject(hook) && typeof hook.command === "string" ? hook.command : undefined;
}

function groupCommands(group: unknown): string[] {
  if (!isObject(group) || !isUnknownArray(group.hooks)) return [];
  return group.hooks.flatMap((hook) => {
    const command = hookCommand(hook);
    return command === undefined ? [] : [command];
  });
}

function rewriteDefinitions(
  definitions: JsonObject,
  rewrite: (command: string) => string | null,
): Map<string, RewrittenGroup[]> {
  const result = new Map<string, RewrittenGroup[]>();
  const { hooks } = definitions;
  if (!isObject(hooks)) return result;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!isUnknownArray(groups)) continue;
    const rewritten: RewrittenGroup[] = [];
    for (const group of groups) {
      if (!isObject(group) || !isUnknownArray(group.hooks)) continue;
      const hooksOfGroup = group.hooks.flatMap((hook): RewrittenHook[] => {
        const command = hookCommand(hook);
        if (command === undefined || !isObject(hook)) return [];
        const next = rewrite(command);
        return next === null ? [] : [{ hook: { ...hook, command: next }, command: next }];
      });
      if (hooksOfGroup.length > 0) {
        const matcher = typeof group.matcher === "string" ? group.matcher : undefined;
        rewritten.push({ group, matcher, hooks: hooksOfGroup });
      }
    }
    if (rewritten.length > 0) result.set(event, rewritten);
  }
  return result;
}

function mergeRewritten(
  document: JsonObject,
  rewritten: Map<string, RewrittenGroup[]>,
): { document: JsonObject; added: string[] } {
  const existingHooks = isObject(document.hooks) ? document.hooks : {};
  const nextHooks: JsonObject = { ...existingHooks };
  const added: string[] = [];
  for (const [event, groups] of rewritten) {
    const current = existingHooks[event];
    if (current !== undefined && !isUnknownArray(current)) continue;
    let nextGroups: unknown[] = isUnknownArray(current) ? [...current] : [];
    for (const { group, matcher, hooks } of groups) {
      const missing: JsonObject[] = [];
      for (const { hook, command } of hooks) {
        const holderIndex = nextGroups.findIndex((candidate) =>
          groupCommands(candidate).includes(command),
        );
        const holder = nextGroups[holderIndex];
        if (holderIndex === -1 || !isObject(holder)) {
          missing.push(hook);
          added.push(command);
          continue;
        }
        if (event === PRETOOLUSE_EVENT && matcher !== undefined && holder.matcher !== matcher) {
          nextGroups = nextGroups.map((candidate, index) =>
            index === holderIndex ? { ...holder, matcher } : candidate,
          );
        }
      }
      if (missing.length > 0) nextGroups.push({ ...group, hooks: missing });
    }
    nextHooks[event] = nextGroups;
  }
  return { document: { ...document, hooks: nextHooks }, added };
}

/**
 * Adds the embedded Claude Code hook definitions to `settings` with absolute commands.
 * Plugin-only entries (the prefetch hook) are skipped, the plugin data dir argument is dropped,
 * existing entries keep their order, identical commands are not repeated and a narrower
 * `PreToolUse` matcher is widened in place.
 */
export function mergeClaudeHooks(
  settings: JsonObject,
  definitions: JsonObject,
  emetBin: string,
): { settings: JsonObject; added: readonly string[] } {
  const rewritten = rewriteDefinitions(definitions, (command) => {
    const stripped = command.replaceAll(CLAUDE_DATA_DIR_ARGUMENT, "");
    if (!stripped.includes(CLAUDE_PLUGIN_BIN)) return null;
    if (!EMET_HOOK_COMMAND.test(stripped.replace(CLAUDE_PLUGIN_BIN, "emet"))) return null;
    return stripped.replace(CLAUDE_PLUGIN_BIN, quote(emetBin));
  });
  const { document, added } = mergeRewritten(settings, rewritten);
  return { settings: document, added };
}

/** Appends the embedded Codex hook definitions after the existing entries of `hooksJson`. */
export function mergeCodexHooks(
  hooksJson: JsonObject,
  definitions: JsonObject,
  emetBin: string,
): { hooksJson: JsonObject; added: readonly string[] } {
  const rewritten = rewriteDefinitions(definitions, (command) =>
    CODEX_BARE_BIN.test(command) ? command.replace(CODEX_BARE_BIN, `$1${quote(emetBin)}`) : null,
  );
  const { document, added } = mergeRewritten(hooksJson, rewritten);
  return { hooksJson: document, added };
}

/** Standalone-only hooks merged beside the embedded definitions; none exist yet. */
export function standaloneExtraHooks(emetBin: string): JsonObject {
  void emetBin;
  return {};
}

/** Drops every emet hook command from `doc`, then the groups and events that removal empties. */
export function removeEmetHooks(doc: JsonObject): { doc: JsonObject; removed: readonly string[] } {
  const { hooks } = doc;
  if (!isObject(hooks)) return { doc, removed: [] };
  const removed: string[] = [];
  const nextHooks: JsonObject = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!isUnknownArray(groups)) {
      nextHooks[event] = groups;
      continue;
    }
    const nextGroups = groups.flatMap((group): unknown[] => {
      if (!isObject(group) || !isUnknownArray(group.hooks)) return [group];
      const remaining = group.hooks.filter((hook) => {
        const command = hookCommand(hook);
        if (command === undefined || !EMET_HOOK_COMMAND.test(command)) return true;
        removed.push(command);
        return false;
      });
      if (remaining.length === group.hooks.length) return [group];
      return remaining.length === 0 ? [] : [{ ...group, hooks: remaining }];
    });
    if (nextGroups.length > 0 || groups.length === 0) nextHooks[event] = nextGroups;
  }
  if (removed.length === 0) return { doc, removed };
  if (Object.keys(nextHooks).length > 0) return { doc: { ...doc, hooks: nextHooks }, removed };
  return {
    doc: Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "hooks")),
    removed,
  };
}
