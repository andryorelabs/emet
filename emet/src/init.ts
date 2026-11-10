import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import type { AgentHost } from "./agenthost";
import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfig,
  resolveRepoRoot,
  type ForgeConfig,
  type TrackerKind,
} from "./config";
import { BINARY, CONFIG_FILE, LEGACY_CONFIG_FILE, LEGACY_PRODUCT, PRODUCT, RUN_DIR } from "./names";
import {
  agentHostOfConfig,
  checkDependencies,
  createDependencyProbes,
  findLinearMcpEntry,
  formatDependencyCheck,
} from "./dependencies";
import { isObject } from "./narrow";
import { readTemplate } from "./assets";

/**
 * `emet init` — generates a repo's `emet.config.json` plus its
 * `docs/agents/{emet,issue-tracker,triage-labels,domain}.md` skeleton from
 * templates, so `/emet` can run in any repo without a human hand-writing
 * either from scratch. Autodetects what it safely can (package manager,
 * trunk branch, tracker kind); everything it can't infer (a shared singleton
 * resource, schema ownership, a Linear team key) is left as a `TODO(emet):`
 * marker in the generated docs — `emet preflight` refuses to dispatch while
 * one remains (see `preflight.ts`'s `checkForTodoMarkers`).
 *
 * Deliberately non-interactive: no readline prompts. A CLI tool asking
 * blocking questions on stdin doesn't compose with how `/emet` itself
 * (a Claude Code command) would drive this — if the command wants an actual
 * conversational interview before running `init`, it has that conversation
 * itself and either edits the generated file afterward or a future flag
 * feeds the answers in directly. `init` today's job is just: infer
 * everything inferable, mark everything else, never guess silently.
 */

export type PackageManager =
  | "bun"
  | "pnpm"
  | "yarn"
  | "npm"
  | "go"
  | "cargo"
  | "uv"
  | "poetry"
  | "pip"
  | "unknown";

export type { TrackerKind };

type JsPackageManager = "bun" | "pnpm" | "yarn" | "npm";

const JS_PACKAGE_MANAGERS: ReadonlySet<string> = new Set(["bun", "pnpm", "yarn", "npm"]);

function isJsPackageManager(value: string): value is JsPackageManager {
  return JS_PACKAGE_MANAGERS.has(value);
}

const PACKAGE_MANAGER_PROBE_FILES: readonly string[] = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "package.json",
  "go.mod",
  "Cargo.toml",
  "uv.lock",
  "poetry.lock",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
];

/**
 * Pure classification shared by `emet init` (files probed on disk) and
 * `emet map` (the tracked file list). Lockfiles win, then the
 * `package.json` `packageManager` field, then a bare `package.json` means
 * npm; non-JS ecosystems follow, and `'unknown'` is never guessed into a
 * JS manager.
 */
export function classifyPackageManager(
  has: (fileName: string) => boolean,
  packageManagerField: string | null,
): PackageManager {
  if (has("bun.lock") || has("bun.lockb")) return "bun";
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("package-lock.json")) return "npm";
  const declared = packageManagerField?.split("@")[0] ?? "";
  if (isJsPackageManager(declared)) return declared;
  if (has("package.json")) return "npm";
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "cargo";
  if (has("uv.lock")) return "uv";
  if (has("poetry.lock")) return "poetry";
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) return "pip";
  return "unknown";
}

async function readPackageManagerField(repoRoot: string): Promise<string | null> {
  const file = Bun.file(path.join(repoRoot, "package.json"));
  if (!(await file.exists())) return null;
  try {
    const parsed: unknown = await file.json();
    return isObject(parsed) && typeof parsed.packageManager === "string"
      ? parsed.packageManager
      : null;
  } catch {
    return null;
  }
}

export async function detectPackageManager(repoRoot: string): Promise<PackageManager> {
  const present = new Set<string>();
  for (const fileName of PACKAGE_MANAGER_PROBE_FILES) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential probe, cheap
    if (await Bun.file(path.join(repoRoot, fileName)).exists()) present.add(fileName);
  }
  return classifyPackageManager(
    (fileName) => present.has(fileName),
    present.has("package.json") ? await readPackageManagerField(repoRoot) : null,
  );
}

/**
 * Non-empty bootstrap per ecosystem; `unknown` has none (never guessed).
 */
export function defaultBootstrap(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "bun": {
      return ["bun install --frozen-lockfile"];
    }
    case "pnpm": {
      return ["pnpm install --frozen-lockfile"];
    }
    case "yarn": {
      return ["yarn install --immutable"];
    }
    case "npm": {
      return ["npm ci"];
    }
    case "uv": {
      return ["uv sync"];
    }
    case "poetry": {
      return ["poetry install"];
    }
    case "pip": {
      return [
        "if [ -f requirements.txt ]; then pip install -r requirements.txt; else pip install -e .; fi",
      ];
    }
    case "go": {
      return ["go mod download"];
    }
    case "cargo": {
      return ["cargo fetch"];
    }
    case "unknown":
    default: {
      return [];
    }
  }
}

/**
 * Ecosystem-default self-check, used when the repo gives no better signal
 * (JS repos prefer their own `package.json` scripts, see
 * {@link detectJsSelfCheck}).
 */
export function defaultSelfCheck(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "bun":
    case "pnpm":
    case "yarn":
    case "npm": {
      return [`${packageManager} run test`];
    }
    case "go": {
      return ["go build ./...", "go test ./..."];
    }
    case "cargo": {
      return ["cargo test", "cargo clippy -- -D warnings"];
    }
    case "uv": {
      return ["uv run pytest"];
    }
    case "poetry": {
      return ["poetry run pytest"];
    }
    case "pip": {
      return ["pytest"];
    }
    case "unknown":
    default: {
      return [];
    }
  }
}

const EMET_BEGIN_MARKER = `<!-- ${PRODUCT}:begin -->`;
const EMET_END_MARKER = `<!-- ${PRODUCT}:end -->`;
const LEGACY_BEGIN_MARKER = `<!-- ${LEGACY_PRODUCT}:begin -->`;
const LEGACY_END_MARKER = `<!-- ${LEGACY_PRODUCT}:end -->`;

/**
 * Inserts `section` between the emet markers: replaces a previous emet
 * section in place, otherwise appends. Everything outside the markers is
 * returned byte-for-byte. `section` may already carry the markers.
 */
export function upsertEmetSection(existing: string, section: string): string {
  const block = section.includes(EMET_BEGIN_MARKER)
    ? section.trim()
    : `${EMET_BEGIN_MARKER}\n${section.trim()}\n${EMET_END_MARKER}`;
  for (const [beginMarker, endMarker] of [
    [EMET_BEGIN_MARKER, EMET_END_MARKER],
    [LEGACY_BEGIN_MARKER, LEGACY_END_MARKER],
  ] as const) {
    const beginIndex = existing.indexOf(beginMarker);
    const endIndex = beginIndex === -1 ? -1 : existing.indexOf(endMarker, beginIndex);
    if (beginIndex !== -1 && endIndex !== -1) {
      return existing.slice(0, beginIndex) + block + existing.slice(endIndex + endMarker.length);
    }
  }
  if (existing.length === 0) return `${block}\n`;
  return `${existing.replace(/\n*$/, "\n")}\n${block}\n`;
}

/**
 * `origin/HEAD`'s symref is the correct source for "which branch is trunk" —
 * unlike `git branch --show-current`, it's unaffected by which branch this
 * checkout happens to have open right now (several repos in this fleet sit on
 * a feature branch most of the time). Returns `null` (never a guessed
 * default) when the symref is missing so the caller can fall back
 * explicitly and say so.
 */
export async function detectTrunk(repoRoot: string): Promise<string | null> {
  const result = await Bun.$`git -C ${repoRoot} symbolic-ref --short refs/remotes/origin/HEAD`
    .nothrow()
    .quiet();
  if (result.exitCode !== 0) return null;
  const ref = result.stdout.toString().trim();
  const prefix = "origin/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref || null;
}

/**
 * Tracker *autodetection* asks a laxer question than the dependency check in
 * `dependencies.ts` does: a Linear entry that exists but is malformed still
 * means "this repo means to use Linear", which is what `init` needs to pick a
 * tracker kind — reporting that the entry is broken is the gate's job, not
 * detection's. Both share {@link findLinearMcpEntry} so the two can never
 * disagree about what counts as a Linear entry in the first place.
 */
export async function hasLinearMcpServer(repoRoot: string): Promise<boolean> {
  const file = Bun.file(path.join(repoRoot, ".mcp.json"));
  if (!(await file.exists())) return false;
  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch {
    return false;
  }
  return findLinearMcpEntry(parsed).kind !== "absent";
}

/**
 * A GitHub remote existing and `gh` being authenticated is *not* by itself
 * evidence this repo actually uses GitHub Issues as its tracker — every
 * repo with `hasIssuesEnabled` (the GitHub default) would match. The real
 * signal is whether the repo has any issue at all, open or closed —
 * surveyed against this fleet, every repo with real issue-tracker usage had
 * several, and every repo without had exactly zero. `gh repo view` failing
 * outright (no remote, `gh` not authenticated) also reads as `false` here,
 * never thrown — this is a soft detection signal, not a required dependency.
 */
async function hasGithubIssueUsage(repoRoot: string): Promise<boolean> {
  const view = await Bun.$`gh repo view --json hasIssuesEnabled -q .hasIssuesEnabled`
    .cwd(repoRoot)
    .nothrow()
    .quiet();
  if (view.exitCode !== 0) return false;
  if (view.stdout.toString().trim() !== "true") return false;
  const list = await Bun.$`gh issue list --state all --limit 1 --json number`
    .cwd(repoRoot)
    .nothrow()
    .quiet();
  if (list.exitCode !== 0) return false;
  try {
    const issues: unknown = JSON.parse(list.stdout.toString());
    return Array.isArray(issues) && issues.length > 0;
  } catch {
    return false;
  }
}

/**
 * Priority order matches `emet.config.json`'s own design notes: a
 * networked tracker only counts if there's real evidence of it — a
 * configured Linear MCP server, or actual (not merely enabled) GitHub Issues
 * usage. Failing both, a `.scratch/` directory (the local tracker's root)
 * means `local`. Absent all three it returns `null` and `init` writes a
 * `TODO(emet):` marker asking the owner to choose.
 */
export async function detectTrackerKind(repoRoot: string): Promise<TrackerKind | null> {
  if (await hasLinearMcpServer(repoRoot)) return "linear";
  if (await hasGithubIssueUsage(repoRoot)) return "github";
  if (await hasScratchDirectory(repoRoot)) return "local";
  return null;
}

async function hasScratchDirectory(repoRoot: string): Promise<boolean> {
  try {
    return (await stat(path.join(repoRoot, ".scratch"))).isDirectory();
  } catch {
    return false;
  }
}

/** True when the repo has at least one git remote configured. */
async function detectHasRemote(repoRoot: string): Promise<boolean> {
  const result = await Bun.$`git -C ${repoRoot} remote`.nothrow().quiet();
  return result.exitCode === 0 && result.stdout.toString().trim().length > 0;
}

/**
 * Reads `package.json`'s own `scripts` map (never invents a command this
 * repo doesn't already have) — prefers a single `check` alias if one exists
 * (this fleet's own convention for "format+lint+typecheck in one call"),
 * otherwise falls back to `lint`+`typecheck` run separately, otherwise an
 * empty list (never guessed) so the generated doc's TODO(emet) is honest
 * about there being nothing to autodetect.
 */
export async function detectJsSelfCheck(
  repoRoot: string,
  packageManager: JsPackageManager,
): Promise<string[]> {
  const file = Bun.file(path.join(repoRoot, "package.json"));
  if (!(await file.exists())) return [];
  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch {
    return [];
  }
  const scripts = isObject(parsed) && isObject(parsed.scripts) ? parsed.scripts : undefined;
  if (!scripts) return [];
  const runner = `${packageManager} run`;
  if (typeof scripts.check === "string") return [`${runner} check`];
  const commands: string[] = [];
  if (typeof scripts.lint === "string") commands.push(`${runner} lint`);
  if (typeof scripts.typecheck === "string") commands.push(`${runner} typecheck`);
  if (commands.length === 0 && typeof scripts.test === "string") commands.push(`${runner} test`);
  return commands;
}

/**
 * Go has no `package.json`/`scripts` map to read, so this is a fixed,
 * near-universal pair (`go vet` is subsumed by `go build`'s own checks) plus
 * `make lint` only if this repo's own `Makefile` actually declares that
 * target — never invented for a repo with no `Makefile` at all.
 */
export async function detectGoSelfCheck(repoRoot: string): Promise<string[]> {
  const commands = ["go build ./...", "go test ./..."];
  const makefile = Bun.file(path.join(repoRoot, "Makefile"));
  if (await makefile.exists()) {
    const content = await makefile.text();
    if (/^lint:/m.test(content)) commands.push("make lint");
  }
  return commands;
}

async function detectSelfCheck(
  repoRoot: string,
  packageManager: PackageManager,
): Promise<string[]> {
  if (isJsPackageManager(packageManager)) return detectJsSelfCheck(repoRoot, packageManager);
  if (packageManager === "go") return detectGoSelfCheck(repoRoot);
  return defaultSelfCheck(packageManager);
}

/**
 * `nfkit` -> `NFK`, `le-petit-prince` -> `LEP`, `a` -> `A` (never empty —
 * `emet.config.json`'s own validation rejects an empty `idPrefix`, and
 * `TICKET` is the last-resort fallback for a basename with no letters at
 * all, e.g. a directory named only digits/punctuation).
 */
export function deriveIdPrefix(repoBasename: string): string {
  const letters = repoBasename.replaceAll(/[^a-zA-Z]/g, "").toUpperCase();
  if (letters.length === 0) return "TICKET";
  return letters.slice(0, 3);
}

export type DetectedRepoInfo = {
  readonly repoName: string;
  readonly packageManager: PackageManager;
  readonly trunk: string;
  readonly trunkWasDetected: boolean;
  readonly tracker: TrackerKind;
  readonly idPrefix: string;
  readonly selfCheck: readonly string[];
  /** When `false` and the tracker is `local`, landing defaults to `merge`. */
  readonly hasRemote?: boolean;
};

const LOCAL_ID_PATTERN = String.raw`^[a-z0-9-]+-\d{2,}$`;

/**
 * Merges autodetected values into a fully-materialized {@link ForgeConfig} —
 * every field explicit, per `emet.config.json`'s own design (`emet init`
 * never writes a partial file relying on implicit defaults, even though the
 * loader would accept one).
 */
export function buildForgeConfig(detected: DetectedRepoInfo): ForgeConfig {
  const isLocal = detected.tracker === "local";
  const landingMode = isLocal && detected.hasRemote === false ? "merge" : "pr";
  return {
    version: 1,
    repo: { trunk: detected.trunk, remote: "origin" },
    ticket: isLocal
      ? { idPattern: LOCAL_ID_PATTERN, branchPrefix: PRODUCT }
      : {
          idPattern: `^${detected.idPrefix}-\\d+$`,
          branchPrefix: detected.idPrefix.toLowerCase(),
        },
    concurrency: { ...DEFAULT_FORGE_CONFIG.concurrency },
    tracker: { kind: detected.tracker },
    /**
     * `gh` is seeded for a github repo so the written config shows the value
     * rather than leaving a reader to infer an implicit one. It is not
     * injected at runtime: `preflight` reads exactly what is on disk.
     */
    preflight: {
      requiredFiles: [],
      requiredCommands: detected.tracker === "github" ? ["gh"] : [],
    },
    handoff: { ...DEFAULT_FORGE_CONFIG.handoff },
    landing: { ...DEFAULT_FORGE_CONFIG.landing, mode: landingMode },
    pr: { ...DEFAULT_FORGE_CONFIG.pr },
    usage: { ...DEFAULT_FORGE_CONFIG.usage },
    models: DEFAULT_FORGE_CONFIG.models,
    review: DEFAULT_FORGE_CONFIG.review,
    budgets: { ...DEFAULT_FORGE_CONFIG.budgets },
    sizing: { ...DEFAULT_FORGE_CONFIG.sizing },
    map: { ...DEFAULT_FORGE_CONFIG.map },
    specs: { ...DEFAULT_FORGE_CONFIG.specs },
  };
}

/**
 * Prose-only `tracker` section (schema at `../schema/emet.config.schema.json`,
 * consumed by the `/emet` *command* per `docs/agents/issue-tracker.md` — see
 * `reference/tracker-<kind>.md` for the literal calls each shape below drives).
 * Never validated by `config.ts` — this CLI never reads it — but every default
 * here has to exist for `/emet` Phase 0 to have something to read at all:
 * without it, `tracker.kind` and `tracker.transitions` (the source of
 * non-negotiable #4 — "the coordinator writes a transition only where
 * `tracker.transitions` names it `coordinator`") are simply undefined, and a
 * freshly-`init`'d repo can't be dispatched against until someone hand-writes
 * this whole block first.
 *
 * `transitions` per kind mirror what
 * `reference/tracker-<kind>.md` and `templates/issue-tracker-<kind>.md.tpl`
 * already document as this repo's own convention — not invented here, only
 * finally written down where the command can actually read them:
 * - `linear`: `onStart` is the worker's own first write; `onPrOpen`/
 *   `onPrMerge` are `automatic` (Linear's GitHub integration moves the issue
 *   on PR open/merge on its own).
 * - `github`: `onStart` is the worker; `onPrOpen` is `coordinator` (a label
 *   swap — GitHub has no native workflow-state field); `onPrMerge` is
 *   `automatic` (the PR's own closing keyword closes the issue).
 * - `local`: no tracker-side automation exists, so every transition is
 *   `coordinator` (see `reference/tracker-local.md`); ids are
 *   `<feature-slug>-<NN>`.
 */
export function buildTrackerConfig(detected: DetectedRepoInfo): Record<string, unknown> {
  if (detected.tracker === "linear") {
    return {
      kind: "linear",
      transitions: { onStart: "worker", onPrOpen: "automatic", onPrMerge: "automatic" },
    };
  }

  if (detected.tracker === "github") {
    return {
      kind: "github",
      transitions: { onStart: "worker", onPrOpen: "coordinator", onPrMerge: "automatic" },
      github: {
        priorityLabels: {},
        stateLabels: {
          todo: "status:todo",
          "in-progress": "status:in-progress",
          "in-review": "status:in-review",
        },
      },
    };
  }

  return {
    kind: "local",
    transitions: { onStart: "coordinator", onPrOpen: "coordinator", onPrMerge: "coordinator" },
  };
}

/** Replaces every `{{TOKEN}}` in `template` with `vars.TOKEN`, throwing on an
 * unresolved token — a silently-unreplaced `{{...}}` in a generated doc is a
 * template bug, not something to ship. */
export function substituteTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replaceAll(/\{\{([A-Z_]+)\}\}/g, (_match, token: string) => {
    if (!(token in vars)) {
      throw new Error(`init: template references unknown placeholder {{${token}}}`);
    }
    return vars[token]!;
  });
}

function selfCheckSection(selfCheck: readonly string[]): string {
  if (selfCheck.length === 0) {
    return (
      "TODO(emet): no self-check command was auto-detected for this repo — " +
      "add one to `commands.selfCheck` in `emet.config.json` (a lint/typecheck " +
      "alias, `go vet`, etc.), or delete this TODO if this repo genuinely has " +
      "none and workers should judge for themselves."
    );
  }
  return `Auto-detected: ${selfCheck.map((command) => `\`${command}\``).join(", ")}.`;
}

function monorepoSection(hasWorkspaces: boolean): string {
  if (hasWorkspaces) {
    return (
      "This repo has monorepo signals (a `pnpm-workspace.yaml`/`workspaces` field, " +
      "or populated `packages/*`). TODO(emet): describe the workspace layout — " +
      "which package(s) a typical ticket touches, and whether `GLOSSARY.md`/" +
      "`docs/adr/` live at the repo root or per-package."
    );
  }
  return (
    "Single-context repo (no monorepo signals detected: no " +
    "`pnpm-workspace.yaml`, no `workspaces` field, no populated `packages/*`).\n\n" +
    "```\n/\n├── GLOSSARY.md\n└── docs/adr/\n    ├── 0001-....md\n    └── 0002-....md\n```"
  );
}

async function detectHasWorkspaces(repoRoot: string): Promise<boolean> {
  if (await Bun.file(path.join(repoRoot, "pnpm-workspace.yaml")).exists()) return true;
  const packageJson = Bun.file(path.join(repoRoot, "package.json"));
  if (await packageJson.exists()) {
    try {
      const parsed: unknown = await packageJson.json();
      if (
        isObject(parsed) &&
        (Array.isArray(parsed.workspaces) || typeof parsed.workspaces === "object")
      ) {
        return true;
      }
    } catch {
      /**
       * malformed package.json — treated as no workspaces, not fatal here
       */
    }
  }
  return false;
}

function idExampleFor(idPrefix: string): string {
  return `${idPrefix}-1`;
}

async function writeIfAbsentOrForced(
  filePath: string,
  content: string,
  force: boolean,
): Promise<"written" | "skipped-exists"> {
  if (!force && (await Bun.file(filePath).exists())) return "skipped-exists";
  await Bun.write(filePath, content);
  return "written";
}

const TRACKER_CHOICE_TODO =
  "TODO(emet): no Linear MCP server, GitHub Issues usage or `.scratch/` directory was " +
  "detected, so `tracker.kind` in `emet.config.json` is a placeholder (`github`). Choose a " +
  "tracker by re-running `emet init --force --tracker <linear|github|local>`.";

const DOC_FOOTERS: readonly string[] = [PRODUCT, LEGACY_PRODUCT].map(
  (name) => `Generated by \`${name} init\``,
);

/**
 * Docs shared with `setup-matt-pocock-skills` (`issue-tracker.md`,
 * `domain.md`, `triage-labels.md`): emet's content lives between the
 * `emet:begin`/`emet:end` markers and nothing outside them is ever touched.
 * A file written by an older emet (footer, no markers) is left alone rather
 * than duplicated.
 */
async function writeSharedDoc(
  filePath: string,
  rendered: string,
): Promise<"written" | "updated" | "skipped-legacy"> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    await Bun.write(filePath, upsertEmetSection("", rendered));
    return "written";
  }
  const existing = await file.text();
  const hasMarkers = existing.includes(EMET_BEGIN_MARKER) || existing.includes(LEGACY_BEGIN_MARKER);
  if (!hasMarkers && DOC_FOOTERS.some((footer) => existing.includes(footer))) {
    return "skipped-legacy";
  }
  await Bun.write(filePath, upsertEmetSection(existing, rendered));
  return "updated";
}

/**
 * For the `local` tracker: appends `.emet/` (runtime state) and `.scratch/`
 * (the unversioned tracker root) unless an equivalent rule is already there.
 * Returns the file content unchanged when both are present.
 */
function appendLocalTrackerIgnores(existing: string, lines: readonly string[]): string {
  const trimmed = new Set(lines.map((line) => line.trim()));
  const missing: string[] = [];
  const runDirRules = [RUN_DIR].flatMap((dir) => [dir, `${dir}/`, `${dir}/*`]);
  if (!runDirRules.some((rule) => trimmed.has(rule))) {
    missing.push(`${RUN_DIR}/`);
  }
  if (![".scratch", ".scratch/"].some((rule) => trimmed.has(rule))) {
    missing.push(".scratch/");
  }
  if (missing.length === 0) return existing;
  const block = ["# emet: runtime state and the local tracker are not versioned.", ...missing, ""];
  const head = existing.length > 0 ? `${existing.replace(/\n+$/, "\n")}\n` : "";
  return `${head}${block.join("\n")}`;
}

/**
 * Ignores emet's runtime state under `.emet/` (reviewer output such as
 * `review-<runId>.md`) for every tracker. For `local` it also ignores
 * `.scratch/` and no longer un-ignores `.emet/tickets/`; other trackers
 * keep the legacy un-ignore of `.emet/tickets/`. Refuses rather than silently
 * doing nothing useful if a broader existing rule (a bare `.emet` or
 * `.emet/` line) would still shadow the un-ignore — that combination needs
 * a human to resolve, not a guess about which line to remove.
 */
async function ensureEmetStateGitignore(repoRoot: string, tracker: TrackerKind): Promise<string[]> {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const file = Bun.file(gitignorePath);
  const existing = (await file.exists()) ? await file.text() : "";
  const lines = existing.split("\n");
  const warnings: string[] = [];

  if (tracker === "local") {
    await Bun.write(gitignorePath, appendLocalTrackerIgnores(existing, lines));
    return warnings;
  }

  const shadowingRule = lines.find((line) =>
    [RUN_DIR].some((dir) => line.trim() === dir || line.trim() === `${dir}/`),
  );
  if (shadowingRule) {
    warnings.push(
      `.gitignore already has a blanket "${shadowingRule.trim()}" rule that would ` +
        `shadow an un-ignore for ${RUN_DIR}/tickets/ — resolve this by hand; the ` +
        `working pattern is \`${RUN_DIR}/*\` followed by \`!${RUN_DIR}/tickets/\`.`,
    );
    return warnings;
  }

  const alreadyPresent = lines.some((line) =>
    [RUN_DIR].some((dir) => line.trim() === `!${dir}/tickets/`),
  );
  if (alreadyPresent) return warnings;

  const block = [
    "",
    "# emet local tracker: tickets are versioned, tracker state is not.",
    `${RUN_DIR}/*`,
    `!${RUN_DIR}/tickets/`,
    "",
  ];
  const updated =
    existing.length > 0 ? `${existing.replace(/\n+$/, "\n")}${block.join("\n")}` : block.join("\n");
  await Bun.write(gitignorePath, updated);
  return warnings;
}

/** Idempotent — `gh label create --force` overwrites color/description on an
 * existing label rather than erroring, matching the plan's "init is the only
 * point where it touches the remote" design. Failures (no `gh`, not
 * authenticated, insufficient permissions) are reported, never fatal to the
 * rest of `init`. */
async function ensureGithubStateLabels(repoRoot: string): Promise<string[]> {
  const labels: Array<{ name: string; color: string; description: string }> = [
    { name: "status:todo", color: "ededed", description: "emet: not started" },
    {
      name: "status:in-progress",
      color: "fbca04",
      description: "emet: a worker is on this",
    },
    {
      name: "status:in-review",
      color: "0e8a16",
      description: "emet: PR open, awaiting merge",
    },
  ];
  const failures: string[] = [];
  for (const label of labels) {
    const result =
      // oxlint-disable-next-line eslint/no-await-in-loop -- git and gh calls stay sequential to keep output and side effects ordered
      await Bun.$`gh label create ${label.name} --color ${label.color} --description ${label.description} --force`
        .cwd(repoRoot)
        .nothrow()
        .quiet();
    if (result.exitCode !== 0) {
      failures.push(`${label.name}: ${result.stderr.toString().trim()}`);
    }
  }
  return failures;
}

export type InitOptions = {
  readonly force: boolean;
  readonly trackerOverride: TrackerKind | null;
};

export function parseInitArguments(argv: readonly string[]): InitOptions {
  const force = argv.includes("--force");
  const trackerIndex = argv.indexOf("--tracker");
  const trackerValue = trackerIndex === -1 ? undefined : argv[trackerIndex + 1];
  if (
    trackerValue !== undefined &&
    trackerValue !== "linear" &&
    trackerValue !== "github" &&
    trackerValue !== "local"
  ) {
    throw new Error(
      `emet init: --tracker must be one of linear|github|local, got "${trackerValue}"`,
    );
  }
  return { force, trackerOverride: trackerValue ?? null };
}

/**
 * The Agent host an existing config selects, read before `--force` rewrites
 * it; Claude Code when there is no readable config yet.
 */
async function resolveInitAgentHost(repoRoot: string): Promise<AgentHost> {
  const loaded = await loadForgeConfig(repoRoot);
  return agentHostOfConfig(loaded.status === "ok" ? loaded.config : DEFAULT_FORGE_CONFIG);
}

/**
 * The `agentHost` and `codex` keys of an existing config, read raw so
 * `--force` carries the user's Agent host choice into the rewritten file
 * instead of silently reverting the repo to Claude Code.
 */
async function readPreservedHostKeys(configPath: string): Promise<Record<string, unknown>> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) return {};
  try {
    const parsed: unknown = await file.json();
    if (typeof parsed !== "object" || parsed === null) return {};
    const preserved: Record<string, unknown> = {};
    for (const key of ["agentHost", "codex"] as const) {
      const value: unknown = Reflect.get(parsed, key);
      if (value !== undefined) preserved[key] = value;
    }
    return preserved;
  } catch {
    return {};
  }
}

async function main(options: InitOptions): Promise<void> {
  const repoRoot = await resolveRepoRoot();
  if (!repoRoot) {
    console.error("emet init: not inside a git repository");
    process.exitCode = 2;
    return;
  }

  const configPath = path.join(repoRoot, CONFIG_FILE);
  const existingConfigPath = [configPath, path.join(repoRoot, LEGACY_CONFIG_FILE)].find(
    (candidate) => existsSync(candidate),
  );
  if (!options.force && existingConfigPath !== undefined) {
    console.error(
      `${BINARY} init: ${existingConfigPath} already exists — pass --force to overwrite.`,
    );
    process.exitCode = 2;
    return;
  }

  const agentHost = await resolveInitAgentHost(repoRoot);
  const repoBasename = path.basename(repoRoot);
  const packageManager = await detectPackageManager(repoRoot);
  const detectedTrunk = await detectTrunk(repoRoot);
  const trunk = detectedTrunk ?? "main";
  const detectedTracker = options.trackerOverride ?? (await detectTrackerKind(repoRoot));
  const trackerNeedsChoice = detectedTracker === null;
  const tracker: TrackerKind = detectedTracker ?? "github";
  const idPrefix = deriveIdPrefix(repoBasename);
  const selfCheck = await detectSelfCheck(repoRoot, packageManager);
  const hasWorkspaces = await detectHasWorkspaces(repoRoot);

  const detected: DetectedRepoInfo = {
    repoName: repoBasename,
    packageManager,
    trunk,
    trunkWasDetected: detectedTrunk !== null,
    tracker,
    idPrefix,
    selfCheck,
    hasRemote: await detectHasRemote(repoRoot),
  };

  const config = buildForgeConfig(detected);
  const configJson = {
    $schema: `~/.claude/${PRODUCT}/schema/${PRODUCT}.config.schema.json`,
    "//":
      `Generated by \`emet init\` on ${new Date().toISOString().slice(0, 10)}. ` +
      "Every value below is either autodetected or a built-in default — review " +
      "before relying on it, especially repo.trunk if it was not detected (see " +
      "the summary this command printed). `commands` is prose-only (see the " +
      "schema) — the /emet command reads it directly, this CLI never does.",
    ...config,
    ...(await readPreservedHostKeys(configPath)),
    tracker: buildTrackerConfig(detected),
    commands: { selfCheck: detected.selfCheck },
    worktree: { bootstrap: defaultBootstrap(packageManager) },
  };
  await Bun.write(configPath, `${JSON.stringify(configJson, null, 2)}\n`);

  const vars: Record<string, string> = {
    REPO_NAME: detected.repoName,
    TRACKER_KIND: detected.tracker,
    ID_PATTERN: config.ticket.idPattern,
    ID_PREFIX: detected.idPrefix,
    ID_EXAMPLE: idExampleFor(detected.idPrefix),
    BRANCH_PREFIX: config.ticket.branchPrefix,
    SELF_CHECK_SECTION: selfCheckSection(detected.selfCheck),
    MONOREPO_SECTION: monorepoSection(hasWorkspaces),
    DATE: new Date().toISOString().slice(0, 10),
  };

  const docsAgentsDirectory = path.join(repoRoot, "docs", "agents");
  await Bun.$`mkdir -p ${docsAgentsDirectory}`.quiet();

  const writes: Array<{ template: string; target: string; shared: boolean; note: string }> = [
    { template: "emet.md.tpl", target: "emet.md", shared: false, note: "" },
    {
      template: `issue-tracker-${detected.tracker}.md.tpl`,
      target: "issue-tracker.md",
      shared: true,
      note: trackerNeedsChoice ? `${TRACKER_CHOICE_TODO}\n\n` : "",
    },
    {
      template: `triage-labels-${detected.tracker}.md.tpl`,
      target: "triage-labels.md",
      shared: true,
      note: "",
    },
    { template: "domain.md.tpl", target: "domain.md", shared: true, note: "" },
  ];

  const results: string[] = [];
  for (const { template, target, shared, note } of writes) {
    const rendered = note + substituteTemplate(readTemplate(template), vars);
    const targetPath = path.join(docsAgentsDirectory, target);
    const write = shared
      ? writeSharedDoc(targetPath, rendered)
      : writeIfAbsentOrForced(targetPath, rendered, options.force);
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const outcome = await write;
    results.push(`docs/agents/${target}: ${outcome}`);
  }

  const warnings: string[] = [];
  if (!detectedTrunk) {
    warnings.push(
      `repo.trunk: could not resolve origin/HEAD's symref — defaulted to "main". ` +
        "Run `git remote set-head origin --auto` if that's wrong, then re-run " +
        "`emet init --force`.",
    );
  }
  warnings.push(...(await ensureEmetStateGitignore(repoRoot, detected.tracker)));
  if (detected.tracker === "github") {
    const labelFailures = await ensureGithubStateLabels(repoRoot);
    if (labelFailures.length > 0) {
      warnings.push(
        `could not create tracker.github status labels (create them by hand): ${labelFailures.join("; ")}`,
      );
    }
  }

  const dependencyChecks = await checkDependencies({
    tracker,
    repoRoot,
    host: agentHost,
    probes: createDependencyProbes(agentHost),
  });

  console.log(`emet init — ${repoRoot}`);
  console.log(`  package manager: ${packageManager}`);
  console.log(`  trunk: ${trunk}${detectedTrunk ? "" : " (default — not detected)"}`);
  console.log(`  tracker: ${tracker}${options.trackerOverride ? " (--tracker override)" : ""}`);
  console.log(`  ticket id prefix: ${idPrefix}`);
  console.log("");
  for (const line of results) console.log(`  ${line}`);
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  const dependencyNotes = dependencyChecks.filter((check) => check.status !== "satisfied");
  const limitations = dependencyChecks.flatMap((check) =>
    check.status === "satisfied" && check.limitation !== null ? [check.limitation] : [],
  );
  if (dependencyNotes.length > 0 || limitations.length > 0) {
    console.log("\nDependencies:");
    for (const check of dependencyNotes) {
      console.log(`  - ${formatDependencyCheck(check, "      ")}`);
    }
    for (const limitation of limitations) console.log(`  - note: ${limitation}`);
  }
  console.log(
    "\nNext: fill in every TODO(emet): marker under docs/agents/ — `emet preflight` refuses to dispatch while one remains.",
  );
}

export async function run(argv: string[]): Promise<void> {
  try {
    const options = parseInitArguments(argv);
    await main(options);
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = process.exitCode ?? 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
