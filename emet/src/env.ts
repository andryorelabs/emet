/** A snapshot or view of environment variables, shaped like `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

interface EnvVarDefinition {
  readonly name: string;
  readonly legacy?: string;
  readonly summary: string;
}

/** Every environment variable the CLI reads. `docs/reference/configuration.md` documents each one. */
export const ENV_VARS = [
  {
    name: "EMET_MAX_LIVE_WORKERS",
    legacy: "FORGE_MAX_LIVE_WORKERS",
    summary:
      "Cap on concurrently live workers: a positive number or `auto`. Overrides `concurrency.maxLiveWorkers`.",
  },
  {
    name: "EMET_STATE_DIR",
    legacy: "FORGE_STATE_DIR",
    summary: "Host-wide state directory, which holds the worker slot pool.",
  },
  {
    name: "EMET_SKIP_DEPENDENCY_CHECKS",
    legacy: "FORGE_SKIP_DEPENDENCY_CHECKS",
    summary: "Set to `1` to downgrade blocking dependency checks to warnings in `emet preflight`.",
  },
  {
    name: "EMET_RUN_IDLE_THRESHOLD_MS",
    legacy: "FORGE_RUN_IDLE_THRESHOLD_MS",
    summary:
      "Milliseconds a run's transcript may stay quiet before it counts as idle. Overrides `concurrency.runIdleThresholdMs`.",
  },
  {
    name: "EMET_CPU_OVERSUBSCRIBE",
    legacy: "FORGE_CPU_OVERSUBSCRIBE",
    summary: "CPU oversubscription factor for the automatic worker cap.",
  },
  {
    name: "EMET_MEM_RESERVE_GIB",
    legacy: "FORGE_MEM_RESERVE_GIB",
    summary: "GiB of memory kept free before a worker slot is granted.",
  },
  {
    name: "EMET_MEM_PER_WORKER_GIB",
    legacy: "FORGE_MEM_PER_WORKER_GIB",
    summary: "GiB of memory assumed per worker by the automatic worker cap.",
  },
  {
    name: "EMET_AGENT_HOST",
    summary: "Set to `codex` when running under the Codex Agent host; anything else means Claude.",
  },
  {
    name: "CODEX_HOME",
    summary: "The Codex home directory; defaults to `~/.codex`. Only ever read.",
  },
  {
    name: "XDG_STATE_HOME",
    summary: "Base for the state directory when `EMET_STATE_DIR` is unset.",
  },
  {
    name: "NO_COLOR",
    summary: "When set, the banner is printed without color.",
  },
] as const satisfies readonly EnvVarDefinition[];

/** The name of a variable in {@link ENV_VARS}. */
export type EnvVarName = (typeof ENV_VARS)[number]["name"];

const warnedNames = new Set<string>();

/**
 * Prints `emet: using legacy <name>; run \`emet migrate\`` to stderr, once per
 * name per process.
 */
export function warnLegacy(name: string): void {
  if (warnedNames.has(name)) return;
  warnedNames.add(name);
  process.stderr.write(`emet: using legacy ${name}; run \`emet migrate\`\n`);
}

/** Forgets which legacy names were already warned about, so tests can assert the warning in any order. */
export function resetLegacyWarnings(): void {
  warnedNames.clear();
}

function legacyNameOf(name: EnvVarName): string | undefined {
  const definition: EnvVarDefinition | undefined = ENV_VARS.find(
    (variable) => variable.name === name,
  );
  return definition?.legacy;
}

/**
 * Reads `name`, falling back to its `FORGE_` legacy spelling (warning once).
 * Empty values count as unset. `env` defaults to the process environment.
 */
export function readEnv(name: EnvVarName, env: Env = process.env): string | undefined {
  const current = env[name];
  if (current) return current;
  const legacyName = legacyNameOf(name);
  if (legacyName === undefined) return undefined;
  const legacy = env[legacyName];
  if (legacy) {
    warnLegacy(legacyName);
    return legacy;
  }
  return undefined;
}

/** The spelling of `name` that is actually set, current first; undefined when neither is. */
export function activeEnvName(name: EnvVarName, env: Env = process.env): string | undefined {
  if (env[name]) return name;
  const legacyName = legacyNameOf(name);
  return legacyName !== undefined && env[legacyName] ? legacyName : undefined;
}

/** A copy of the environment, for handing to a child process. */
export function snapshotEnv(env: Env = process.env): Record<string, string | undefined> {
  return { ...env };
}
