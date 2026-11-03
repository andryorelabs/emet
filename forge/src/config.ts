import path from "node:path";
import { errorMessage, isOneOf } from "./narrow";

/**
 * `forge.config.json` — the per-repo config that makes `/forge`'s repo-side
 * machinery (this CLI) work in any git repo instead of only in the one it
 * was extracted from. Strict JSON, not JSONC or YAML frontmatter:
 * see the README for why (in
 * short — a networked-tracker adapter's docs live in prose the model
 * rewrites mid-run, and this repo has already been bitten once by Prettier
 * reflowing a block inside a markdown file and silently corrupting it).
 *
 * This module only types and validates the subset of the config this CLI's
 * scripts (`preflight`, `claims`, `slots`, `cleanup`, `usage`, `handoff`,
 * `doctor`) actually read at runtime — `repo`, `ticket`, `concurrency`,
 * `tracker.kind`, `preflight`, `handoff`, `usage`. The rest of the full schema
 * (the remainder of `tracker`, `commands`, `worktree.bootstrap`, `commit`,
 * `schema.ownedPaths`, `design`) is consumed by the `/forge` *command* itself
 * — read directly by the model as instructions to follow, never by this code
 * — so it is type-checked by the JSON Schema at
 * `../schema/forge.config.schema.json` (for editor completion) but not
 * re-validated here. An unrecognized top-level key is never an error: this
 * file only complains about the keys it actually uses.
 */

/**
 * Which issue tracker `/forge` talks to in a given repo. Lives here rather
 * than in `init.ts` (which is where it was first needed) because
 * `dependencies.ts` keys its tracker-specific checks off it and `init.ts`
 * already imports from this module — the other direction would be a cycle.
 */
export type TrackerKind = "linear" | "github" | "local";

export const DEFAULT_FORGE_CONFIG: ForgeConfig = {
  version: 1,
  repo: { trunk: "main", remote: "origin" },
  ticket: { idPattern: "^[A-Z][A-Z0-9]*-\\d+$", branchPrefix: "ticket" },
  concurrency: {
    waveSize: 4,
    maxLiveWorkers: "auto",
    runIdleThresholdMs: 90 * 60_000,
  },
  tracker: { kind: null },
  preflight: { requiredFiles: [], requiredCommands: [] },
  handoff: {
    maxLines: 60,
    maxChars: 8000,
    autoChain: false,
    launcher: "auto",
    permissionMode: "bypassPermissions",
  },
  pr: { autoMerge: true, mergeMethod: "squash", maxCiFixAttempts: 2 },
  usage: { oversizedReadLines: 400, stalledMinutes: 10 },
  models: {
    worker: { model: "sonnet", effort: "medium" },
    reviewer: {
      medium: { model: "opus", effort: "medium" },
      high: { model: "opus", effort: "medium" },
    },
    triage: "haiku",
    escalation: { sonnet: "opus" },
  },
  review: { highRiskPaths: [] },
  budgets: { workerAttempts: 2, reviewRounds: 2, stallNudgeCap: 6 },
  sizing: { inlineMaxLines: 100 },
  map: { path: "docs/agents/codebase.md" },
  specs: { dir: "docs/specs" },
};

type ModelEffort = "low" | "medium" | "high" | "xhigh" | "max";

const MODEL_EFFORTS: readonly ModelEffort[] = ["low", "medium", "high", "xhigh", "max"];

export interface ModelChoice {
  readonly model: string;
  readonly effort: ModelEffort;
}

export type HandoffLauncher = "auto" | "orca" | "bg";

const HANDOFF_LAUNCHERS: readonly HandoffLauncher[] = ["auto", "orca", "bg"];

export type HandoffPermissionMode = "bypassPermissions" | "auto" | "acceptEdits";

const HANDOFF_PERMISSION_MODES: readonly HandoffPermissionMode[] = [
  "bypassPermissions",
  "auto",
  "acceptEdits",
];

type MergeMethod = "squash" | "merge" | "rebase";

const MERGE_METHODS: readonly MergeMethod[] = ["squash", "merge", "rebase"];

export interface ForgeConfig {
  readonly version: 1;
  readonly repo: {
    /** The branch every worker's changes ultimately merge toward, and every
     * `cleanup`/`preflight` git comparison is made against (e.g. `main`,
     * `master`). */
    readonly trunk: string;
    /** The git remote `trunk` lives on — almost always `origin`. */
    readonly remote: string;
  };
  readonly ticket: {
    /** Anchored regex *source* (no leading `^`/trailing `$` requirement
     * enforced, but every built-in default and `forge init` template
     * includes them) a ticket id must match — e.g. `^AO-\\d+$`,
     * `^#?\\d+$` for a `local`/`github`-numbered tracker. */
    readonly idPattern: string;
    /** Lowercase prefix used to build a worker's local branch name and the
     * glob `cleanup` sweeps for leftover worker branches — branches are
     * `<branchPrefix>-<number>-<slug>`, glob `<branchPrefix>-*`. */
    readonly branchPrefix: string;
  };
  readonly concurrency: {
    /** Max `Agent` calls dispatched together in one wave. */
    readonly waveSize: number;
    /** Global, host-wide cap shared by every concurrently running
     * coordinator on this machine, across every repo — the slot pool lives
     * under `~/.local/state/forge/slots` (see `slots.ts`), not under any one
     * repo's `--git-common-dir`. `"auto"` (the default) derives the cap from
     * this host's own cpu/RAM (`resources.ts`'s `computeAutoMaxLiveWorkers`)
     * instead of a fixed number nobody measured. `FORGE_MAX_LIVE_WORKERS` env
     * var overrides either form when set. */
    readonly maxLiveWorkers: number | "auto";
    /** How long a run with no live anchor still classifies `'idle'` (rather
     * than `'dead'`) based on transcript freshness alone —
     * `FORGE_RUN_IDLE_THRESHOLD_MS` env var overrides this when set. */
    readonly runIdleThresholdMs: number;
  };
  readonly tracker: {
    /** Which issue tracker this repo's `/forge` runs against. `null` when the
     * config predates this field: tracker-specific dependency checks (`gh`,
     * the Linear MCP server) are then skipped rather than guessed, since
     * defaulting to any one kind would silently hide the check a repo of
     * another kind actually needs. The rest of the `tracker` section stays
     * prose for the `/forge` command; only `kind` is read here. */
    readonly kind: TrackerKind | null;
  };
  readonly preflight: {
    /** Files `forge preflight` requires to exist at the repo root before a
     * wave dispatches, each with a `why` shown in the failure message.
     * Generalizes what used to be a hardcoded `.env.keys` check — empty
     * means no such check runs at all. */
    readonly requiredFiles: ReadonlyArray<{
      readonly path: string;
      readonly why: string;
    }>;
    /** Binaries that must resolve on `PATH` before a wave dispatches — the
     * repo's own list (`rg`, `sg`, a linter), separate from the dependency
     * checks that `tracker.kind` drives. Empty means no such check runs. */
    readonly requiredCommands: readonly string[];
  };
  readonly handoff: {
    readonly maxLines: number;
    readonly maxChars: number;
    /** When true, a wave that closes cleanly with a non-empty frontier
     * launches the next wave itself via `claude --bg` instead of printing
     * the `/forge --dispatch` command for a human to paste. */
    readonly autoChain: boolean;
    /** Where a chained wave becomes visible: `auto` opens an Orca tab when
     * the session runs inside Orca, `orca` always tries, `bg` never does. */
    readonly launcher: HandoffLauncher;
    /** Permission mode the chained wave's `claude --bg` session runs in. */
    readonly permissionMode: HandoffPermissionMode;
  };
  readonly pr: {
    /** When true, Phase 8 waits for the wave PR's checks and merges it. */
    readonly autoMerge: boolean;
    readonly mergeMethod: MergeMethod;
    /** How many times the coordinator may try to fix a failing check before
     * leaving the PR open for a human. */
    readonly maxCiFixAttempts: number;
  };
  readonly usage: {
    /** A `Read` with no `offset`/`limit` against a file over this many lines
     * counts as "oversized" in `forge usage`'s report. */
    readonly oversizedReadLines: number;
    /** Default `--minutes` threshold for `forge usage --stalled`. */
    readonly stalledMinutes: number;
  };
  readonly models: {
    readonly worker: ModelChoice;
    /** Reviewer model per risk tier `forge assess` can return. */
    readonly reviewer: { readonly medium: ModelChoice; readonly high: ModelChoice };
    /** Cheap model used for triage and passive-tier review. */
    readonly triage: string;
    /** Next model tier per model name, used when a ticket hits its fix cap. */
    readonly escalation: Readonly<Record<string, string>>;
  };
  readonly review: {
    /** Extra path tokens (case-insensitive substrings) that force the `high`
     * tier in `forge assess`, on top of the built-in set. */
    readonly highRiskPaths: readonly string[];
  };
  readonly budgets: {
    /** Worker attempts per ticket before it is deferred. */
    readonly workerAttempts: number;
    /** Review/fix rounds per ticket. */
    readonly reviewRounds: number;
    /** Stall nudges per worker; never refills. */
    readonly stallNudgeCap: number;
  };
  readonly sizing: {
    /** Largest ticket body (lines) kept inline in a worker prompt. */
    readonly inlineMaxLines: number;
  };
  readonly map: {
    /** Repo-relative path of the generated codebase map. */
    readonly path: string;
  };
  readonly specs: {
    /** Repo-relative directory of living specs. */
    readonly dir: string;
  };
}

/**
 * The worker model for a ticket: its own `Model:` line wins over
 * `models.worker.model`. A `model/effort` value (e.g. `opus/high`) also
 * overrides the effort; a bare model keeps the configured one, and an
 * unrecognized effort part is ignored rather than passed through.
 */
export function resolveWorkerModel(config: ForgeConfig, ticketModel?: string): ModelChoice {
  const override = ticketModel?.trim();
  if (!override) return config.models.worker;
  const [modelPart = "", effortPart = ""] = override.split("/", 2).map((part) => part.trim());
  if (!modelPart) return config.models.worker;
  const effort = isOneOf(MODEL_EFFORTS, effortPart) ? effortPart : config.models.worker.effort;
  return { model: modelPart, effort };
}

/**
 * Thrown for a `forge.config.json` that is absent (when the caller requires
 * one) or malformed — never for an ordinary "no findings" result. Every
 * subcommand's `run()` catches this specifically to exit `2` (config/usage
 * error, the tool never actually ran) instead of `3` (internal error) or `1`
 * (findings to act on) — see `bin/forge.ts`'s exit-code table.
 */
export class ForgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgeConfigError";
  }
}

type ConfigLoadResult =
  | { readonly status: "absent" }
  | { readonly status: "malformed"; readonly reason: string }
  | { readonly status: "ok"; readonly config: ForgeConfig };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function mergeModelChoice(
  raw: unknown,
  fallback: ModelChoice,
  field: string,
): { ok: true; value: ModelChoice } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, value: fallback };
  if (!isRecord(raw)) return { ok: false, reason: `"${field}" must be an object` };
  const model = raw.model ?? fallback.model;
  const effort = raw.effort ?? fallback.effort;
  if (!isNonEmptyString(model)) {
    return { ok: false, reason: `"${field}.model" must be a non-empty string` };
  }
  if (!isOneOf(MODEL_EFFORTS, effort)) {
    return { ok: false, reason: `"${field}.effort" must be one of ${MODEL_EFFORTS.join("|")}` };
  }
  return { ok: true, value: { model, effort } };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Validates only the fields this CLI reads, merging anything absent from
 * `DEFAULT_FORGE_CONFIG` — a repo's `forge.config.json` need not repeat every
 * default (though `forge init` always writes the file fully materialized so
 * a human reading it never has to guess an implicit value). Returns a
 * `reason` string, never throws, so `loadForgeConfig` can turn it into an
 * exit-2 `ForgeConfigError` with full context in the caller-chosen tier.
 */
function validateAndMerge(
  raw: unknown,
): { ok: true; config: ForgeConfig } | { ok: false; reason: string } {
  if (!isRecord(raw)) {
    return { ok: false, reason: "top-level value must be a JSON object" };
  }
  if (raw.version !== undefined && raw.version !== 1) {
    return {
      ok: false,
      reason: `unsupported "version": ${JSON.stringify(raw.version)} (expected 1)`,
    };
  }

  const repo = isRecord(raw.repo) ? raw.repo : {};
  const trunk = repo.trunk ?? DEFAULT_FORGE_CONFIG.repo.trunk;
  const remote = repo.remote ?? DEFAULT_FORGE_CONFIG.repo.remote;
  if (!isNonEmptyString(trunk)) {
    return { ok: false, reason: '"repo.trunk" must be a non-empty string' };
  }
  if (!isNonEmptyString(remote)) {
    return { ok: false, reason: '"repo.remote" must be a non-empty string' };
  }

  const ticket = isRecord(raw.ticket) ? raw.ticket : {};
  const idPattern = ticket.idPattern ?? DEFAULT_FORGE_CONFIG.ticket.idPattern;
  const branchPrefix = ticket.branchPrefix ?? DEFAULT_FORGE_CONFIG.ticket.branchPrefix;
  if (!isNonEmptyString(idPattern)) {
    return { ok: false, reason: '"ticket.idPattern" must be a non-empty string' };
  }
  try {
    // eslint-disable-next-line no-new
    new RegExp(idPattern);
  } catch (error) {
    return {
      ok: false,
      reason: `"ticket.idPattern" is not a valid regular expression: ${errorMessage(error)}`,
    };
  }
  if (!isNonEmptyString(branchPrefix) || /[^a-z0-9-]/.test(branchPrefix)) {
    return {
      ok: false,
      reason:
        '"ticket.branchPrefix" must be a non-empty lowercase string of letters, digits, and hyphens',
    };
  }

  const concurrency = isRecord(raw.concurrency) ? raw.concurrency : {};
  const waveSize = concurrency.waveSize ?? DEFAULT_FORGE_CONFIG.concurrency.waveSize;
  const maxLiveWorkersRaw =
    concurrency.maxLiveWorkers ?? DEFAULT_FORGE_CONFIG.concurrency.maxLiveWorkers;
  const runIdleThresholdMs =
    concurrency.runIdleThresholdMs ?? DEFAULT_FORGE_CONFIG.concurrency.runIdleThresholdMs;
  if (!isPositiveInteger(waveSize)) {
    return { ok: false, reason: '"concurrency.waveSize" must be a positive integer' };
  }
  if (maxLiveWorkersRaw !== "auto" && !isPositiveInteger(maxLiveWorkersRaw)) {
    return {
      ok: false,
      reason: '"concurrency.maxLiveWorkers" must be a positive integer, or the string "auto"',
    };
  }
  /**
   * `maxLiveWorkersRaw` is validated but not narrowed by the guard above (a
   * compound `!== 'auto' && !isPositiveInteger(...)` check doesn't narrow a
   * value whose static type is `unknown`) — this ternary is the explicit,
   * TS-checkable equivalent instead of relying on control-flow narrowing.
   */
  const maxLiveWorkers: number | "auto" = maxLiveWorkersRaw === "auto" ? "auto" : maxLiveWorkersRaw;
  if (!isPositiveInteger(runIdleThresholdMs)) {
    return { ok: false, reason: '"concurrency.runIdleThresholdMs" must be a positive integer' };
  }

  const preflightSection = isRecord(raw.preflight) ? raw.preflight : {};
  const requiredFilesRaw = preflightSection.requiredFiles;
  const requiredFiles: Array<{ path: string; why: string }> = [];
  if (requiredFilesRaw !== undefined) {
    if (!Array.isArray(requiredFilesRaw)) {
      return { ok: false, reason: '"preflight.requiredFiles" must be an array' };
    }
    for (const [index, entry] of requiredFilesRaw.entries()) {
      if (!isRecord(entry) || !isNonEmptyString(entry.path) || !isNonEmptyString(entry.why)) {
        return {
          ok: false,
          reason: `"preflight.requiredFiles[${index}]" must be {"path": string, "why": string}, both non-empty`,
        };
      }
      requiredFiles.push({ path: entry.path, why: entry.why });
    }
  }

  const requiredCommandsRaw = preflightSection.requiredCommands;
  const requiredCommands: string[] = [];
  if (requiredCommandsRaw !== undefined) {
    if (!Array.isArray(requiredCommandsRaw)) {
      return { ok: false, reason: '"preflight.requiredCommands" must be an array' };
    }
    for (const [index, entry] of requiredCommandsRaw.entries()) {
      if (!isNonEmptyString(entry)) {
        return {
          ok: false,
          reason: `"preflight.requiredCommands[${index}]" must be a non-empty string`,
        };
      }
      requiredCommands.push(entry);
    }
  }

  const trackerSection = raw.tracker;
  let trackerKind: TrackerKind | null = null;
  if (trackerSection !== undefined) {
    if (!isRecord(trackerSection)) {
      return { ok: false, reason: '"tracker" must be an object' };
    }
    const kind = trackerSection.kind;
    if (kind !== undefined) {
      if (kind !== "linear" && kind !== "github" && kind !== "local") {
        return { ok: false, reason: '"tracker.kind" must be one of linear|github|local' };
      }
      trackerKind = kind;
    }
  }

  const handoffSection = isRecord(raw.handoff) ? raw.handoff : {};
  const maxLines = handoffSection.maxLines ?? DEFAULT_FORGE_CONFIG.handoff.maxLines;
  const maxChars = handoffSection.maxChars ?? DEFAULT_FORGE_CONFIG.handoff.maxChars;
  if (!isPositiveInteger(maxLines)) {
    return { ok: false, reason: '"handoff.maxLines" must be a positive integer' };
  }
  if (!isPositiveInteger(maxChars)) {
    return { ok: false, reason: '"handoff.maxChars" must be a positive integer' };
  }
  const autoChain = handoffSection.autoChain ?? DEFAULT_FORGE_CONFIG.handoff.autoChain;
  if (typeof autoChain !== "boolean") {
    return { ok: false, reason: '"handoff.autoChain" must be a boolean' };
  }
  const launcher = handoffSection.launcher ?? DEFAULT_FORGE_CONFIG.handoff.launcher;
  if (!isOneOf(HANDOFF_LAUNCHERS, launcher)) {
    return { ok: false, reason: '"handoff.launcher" must be one of auto|orca|bg' };
  }
  const permissionMode =
    handoffSection.permissionMode ?? DEFAULT_FORGE_CONFIG.handoff.permissionMode;
  if (!isOneOf(HANDOFF_PERMISSION_MODES, permissionMode)) {
    return {
      ok: false,
      reason: '"handoff.permissionMode" must be one of bypassPermissions|auto|acceptEdits',
    };
  }

  const prSection = isRecord(raw.pr) ? raw.pr : {};
  const autoMerge = prSection.autoMerge ?? DEFAULT_FORGE_CONFIG.pr.autoMerge;
  const mergeMethod = prSection.mergeMethod ?? DEFAULT_FORGE_CONFIG.pr.mergeMethod;
  const maxCiFixAttempts = prSection.maxCiFixAttempts ?? DEFAULT_FORGE_CONFIG.pr.maxCiFixAttempts;
  if (typeof autoMerge !== "boolean") {
    return { ok: false, reason: '"pr.autoMerge" must be a boolean' };
  }
  if (!isOneOf(MERGE_METHODS, mergeMethod)) {
    return { ok: false, reason: '"pr.mergeMethod" must be one of squash|merge|rebase' };
  }
  if (
    typeof maxCiFixAttempts !== "number" ||
    !Number.isInteger(maxCiFixAttempts) ||
    maxCiFixAttempts < 0
  ) {
    return { ok: false, reason: '"pr.maxCiFixAttempts" must be a non-negative integer' };
  }

  const usageSection = isRecord(raw.usage) ? raw.usage : {};
  const oversizedReadLines =
    usageSection.oversizedReadLines ?? DEFAULT_FORGE_CONFIG.usage.oversizedReadLines;
  const stalledMinutes = usageSection.stalledMinutes ?? DEFAULT_FORGE_CONFIG.usage.stalledMinutes;
  if (!isPositiveInteger(oversizedReadLines)) {
    return { ok: false, reason: '"usage.oversizedReadLines" must be a positive integer' };
  }
  if (!isPositiveInteger(stalledMinutes)) {
    return { ok: false, reason: '"usage.stalledMinutes" must be a positive integer' };
  }

  const modelsSection = raw.models;
  if (modelsSection !== undefined && !isRecord(modelsSection)) {
    return { ok: false, reason: '"models" must be an object' };
  }
  const modelsRecord = modelsSection ?? {};
  const defaultModels = DEFAULT_FORGE_CONFIG.models;
  const worker = mergeModelChoice(modelsRecord.worker, defaultModels.worker, "models.worker");
  if (!worker.ok) return worker;
  const reviewerRaw = modelsRecord.reviewer;
  if (reviewerRaw !== undefined && !isRecord(reviewerRaw)) {
    return { ok: false, reason: '"models.reviewer" must be an object' };
  }
  const reviewerRecord = reviewerRaw ?? {};
  const reviewerMedium = mergeModelChoice(
    reviewerRecord.medium,
    defaultModels.reviewer.medium,
    "models.reviewer.medium",
  );
  if (!reviewerMedium.ok) return reviewerMedium;
  const reviewerHigh = mergeModelChoice(
    reviewerRecord.high,
    defaultModels.reviewer.high,
    "models.reviewer.high",
  );
  if (!reviewerHigh.ok) return reviewerHigh;
  const triage = modelsRecord.triage ?? defaultModels.triage;
  if (!isNonEmptyString(triage)) {
    return { ok: false, reason: '"models.triage" must be a non-empty string' };
  }

  const escalationRaw = modelsRecord.escalation;
  let escalation: Record<string, string> = { ...defaultModels.escalation };
  if (escalationRaw !== undefined) {
    if (!isRecord(escalationRaw)) {
      return { ok: false, reason: '"models.escalation" must be an object' };
    }
    escalation = {};
    for (const [tier, next] of Object.entries(escalationRaw)) {
      if (!isNonEmptyString(next)) {
        return { ok: false, reason: `"models.escalation.${tier}" must be a non-empty string` };
      }
      escalation[tier] = next;
    }
  }

  const reviewSection = isRecord(raw.review) ? raw.review : {};
  const highRiskPathsRaw = reviewSection.highRiskPaths;
  const highRiskPaths: string[] = [];
  if (highRiskPathsRaw !== undefined) {
    if (!Array.isArray(highRiskPathsRaw)) {
      return { ok: false, reason: '"review.highRiskPaths" must be an array' };
    }
    for (const [index, entry] of highRiskPathsRaw.entries()) {
      if (!isNonEmptyString(entry)) {
        return { ok: false, reason: `"review.highRiskPaths[${index}]" must be a non-empty string` };
      }
      highRiskPaths.push(entry);
    }
  }

  const budgetsSection = raw.budgets;
  if (budgetsSection !== undefined && !isRecord(budgetsSection)) {
    return { ok: false, reason: '"budgets" must be an object' };
  }
  const budgetsRecord = budgetsSection ?? {};
  const budgetKeys = ["workerAttempts", "reviewRounds", "stallNudgeCap"] as const;
  const budgets = { ...DEFAULT_FORGE_CONFIG.budgets };
  for (const key of budgetKeys) {
    const value = budgetsRecord[key];
    if (value === undefined) continue;
    if (!isPositiveInteger(value)) {
      return { ok: false, reason: `"budgets.${key}" must be a positive integer` };
    }
    budgets[key] = value;
  }

  const sizingRecord = isRecord(raw.sizing) ? raw.sizing : {};
  const inlineMaxLines = sizingRecord.inlineMaxLines ?? DEFAULT_FORGE_CONFIG.sizing.inlineMaxLines;
  if (!isPositiveInteger(inlineMaxLines)) {
    return { ok: false, reason: '"sizing.inlineMaxLines" must be a positive integer' };
  }

  const mapRecord = isRecord(raw.map) ? raw.map : {};
  const mapPath = mapRecord.path ?? DEFAULT_FORGE_CONFIG.map.path;
  if (!isNonEmptyString(mapPath)) {
    return { ok: false, reason: '"map.path" must be a non-empty string' };
  }

  const specsRecord = isRecord(raw.specs) ? raw.specs : {};
  const specsDir = specsRecord.dir ?? DEFAULT_FORGE_CONFIG.specs.dir;
  if (!isNonEmptyString(specsDir)) {
    return { ok: false, reason: '"specs.dir" must be a non-empty string' };
  }

  return {
    ok: true,
    config: {
      version: 1,
      repo: { trunk, remote },
      ticket: { idPattern, branchPrefix },
      concurrency: { waveSize, maxLiveWorkers, runIdleThresholdMs },
      tracker: { kind: trackerKind },
      preflight: { requiredFiles, requiredCommands },
      handoff: {
        maxLines,
        maxChars,
        autoChain,
        launcher,
        permissionMode,
      },
      pr: { autoMerge, mergeMethod, maxCiFixAttempts },
      usage: { oversizedReadLines, stalledMinutes },
      models: {
        worker: worker.value,
        reviewer: { medium: reviewerMedium.value, high: reviewerHigh.value },
        triage,
        escalation,
      },
      review: { highRiskPaths },
      budgets,
      sizing: { inlineMaxLines },
      map: { path: mapPath },
      specs: { dir: specsDir },
    },
  };
}

/**
 * Reads and validates `<repoRoot>/forge.config.json`. Never throws — callers
 * pick the tier-appropriate behavior for `'absent'` via
 * {@link requireForgeConfig} (gating/destructive subcommands) or
 * {@link loadForgeConfigWithDefaults} (read-only subcommands); `'malformed'`
 * is always an error in both tiers, since silently falling back to a default
 * `repo.trunk`/`ticket.idPattern` on a typo'd config is exactly how a
 * destructive command like `cleanup` could force-delete unmerged work
 * against the wrong branch.
 */
export async function loadForgeConfig(repoRoot: string): Promise<ConfigLoadResult> {
  const configPath = path.join(repoRoot, "forge.config.json");
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    return { status: "absent" };
  }
  let raw: unknown;
  try {
    raw = await file.json();
  } catch (error) {
    return {
      status: "malformed",
      reason: `${configPath} is not valid JSON: ${errorMessage(error)}`,
    };
  }
  const validated = validateAndMerge(raw);
  if (!validated.ok) {
    return { status: "malformed", reason: `${configPath}: ${validated.reason}` };
  }
  return { status: "ok", config: validated.config };
}

/**
 * For gating or destructive subcommands (`preflight`, `cleanup`,
 * `claims --reserve`/`--release`/`--prune`, `slots --acquire`/`--release`):
 * absent or malformed are both a hard `ForgeConfigError`. A repo with no
 * config has never declared it's safe to run `/forge` unattended against.
 */
export async function requireForgeConfig(repoRoot: string): Promise<ForgeConfig> {
  const result = await loadForgeConfig(repoRoot);
  if (result.status === "ok") return result.config;
  if (result.status === "absent") {
    throw new ForgeConfigError(
      `no forge.config.json at ${repoRoot} — run \`forge init\` in this repo first.`,
    );
  }
  throw new ForgeConfigError(result.reason);
}

/**
 * For read-only subcommands (`usage`, `handoff --check`/`--render`,
 * `claims --list`, `slots --list`): absent degrades to
 * {@link DEFAULT_FORGE_CONFIG} with a note to print, since nothing here can
 * destroy anything. Malformed is still a hard `ForgeConfigError` — a config
 * file that exists but fails to parse is never silently ignored, even for a
 * read-only command, so a typo is never mistaken for "this repo just has no
 * config yet".
 */
export async function loadForgeConfigWithDefaults(
  repoRoot: string,
): Promise<{ readonly config: ForgeConfig; readonly note?: string }> {
  const result = await loadForgeConfig(repoRoot);
  if (result.status === "ok") return { config: result.config };
  if (result.status === "malformed") {
    throw new ForgeConfigError(result.reason);
  }
  return {
    config: DEFAULT_FORGE_CONFIG,
    note: "note: no forge.config.json — using defaults",
  };
}

export async function resolveRepoRoot(): Promise<string | null> {
  const output = await Bun.$`git rev-parse --show-toplevel`.nothrow().quiet();
  const root = output.stdout.toString().trim();
  return output.exitCode === 0 && root.length > 0 ? root : null;
}
