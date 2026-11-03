import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadForgeConfig, type TrackerKind } from "./config";
import {
  checkDependencies,
  classifyClaudePluginProbe,
  classifyForgeAgentsProbe,
  createDependencyProbes,
  formatDependencyCheck,
  resolveBinaryOnPath,
  type DependencyCheck,
  type DependencyProbes,
} from "./dependencies";
import { isObject } from "./narrow";
import { DEPRECATED_CONFIG_FIELDS, findTodoMarkersInDocsAgents } from "./preflight";
import { computeAutoMaxLiveWorkers, readHostResources } from "./resources";
import {
  checkSkillsContract,
  findPluginByName,
  listInstalledPlugins,
  type InstalledPlugin,
} from "./skills";
import { listOccupiedSlots, resolveLegacySlotsDirectory } from "./slots";

/**
 * `forge doctor` — a read-only fleet sweep. `forge preflight` answers "is
 * dispatch safe right now" for one repo you're standing in; this answers
 * "is `/forge` even set up correctly" across every repo you point it at
 * (e.g. `forge doctor ~/code/*`, shell-glob-expanded before this ever sees
 * argv). Never writes anything, never requires a git repo it's told to
 * check to exist — a path that isn't a repo, or a repo with no
 * `forge.config.json` at all, is a normal, reportable finding, not a crash.
 *
 * Also reports third-party dependency findings (see `dependencies.ts`): the
 * mattpocock-skills plugin and the `forge-worker`/`forge-reviewer` agents in
 * `~/.claude/agents/` (both global — one repo-independent finding each,
 * printed once for the whole sweep, not per repo) and, per repo, `gh` or the
 * Linear MCP server when that repo's `tracker.kind` calls for it. Unlike
 * `preflight`, an `unsatisfied` finding here never blocks anything — this
 * command only ever reports.
 */

const REQUIRED_DOCS = ["forge.md", "issue-tracker.md", "triage-labels.md", "domain.md"];

export type RepoDoctorReport = {
  readonly path: string;
  readonly isGitRepo: boolean;
  readonly hasConfig: boolean;
  readonly configError: string | null;
  readonly missingDocs: readonly string[];
  readonly todoMarkers: readonly string[];
  readonly selfCheckIssues: readonly string[];
  /** This repo's declared tracker, straight from its config — `null` when
   * absent, which is also why tracker-scoped dependency findings below may
   * be empty even for a repo that actually needs `gh` or Linear. */
  readonly trackerKind: TrackerKind | null;
  /** Repo-scoped dependency findings only (`gh`, Linear) — the plugin check
   * is global and printed once, not per repo; see {@link auditFleet}. */
  readonly dependencyFindings: readonly DependencyCheck[];
  /** Non-`null` only when this repo's `concurrency.maxLiveWorkers` is a
   * pinned number lower than what this HOST could auto-compute
   * (`resources.ts`'s `computeAutoMaxLiveWorkers`) — informational, never
   * part of {@link isReportClean}: a repo may have a deliberate reason to
   * pin it low (a heavier per-worker footprint than the default budget
   * assumes), so this is a nudge toward `"auto"`, not a finding to fix. */
  readonly maxLiveWorkersNote: string | null;
  /** Tracker-target and worktree fork-base findings for this repo — each is a
   * known mismatch (never "could not check"), so any entry dirties the repo. */
  readonly environmentFindings: readonly string[];
  /** Warnings only (never part of {@link isReportClean}): a legacy
   * `CONTEXT.md` without `GLOSSARY.md`, or a deprecated config field that is
   * still set. */
  readonly warnings: readonly string[];
};

/** A repo is clean if every check came back empty/false-negative — used both
 * to decide the process exit code and to print a one-line "OK" per repo
 * instead of an empty findings list. An `indeterminate` dependency finding
 * (e.g. `gh auth status` timing out) does not dirty a repo — it is something
 * that could not be checked, not something known to be wrong. */
export function isReportClean(report: RepoDoctorReport): boolean {
  if (!report.isGitRepo) return false;
  if (!report.hasConfig) return false;
  if (report.configError !== null) return false;
  return (
    report.missingDocs.length === 0 &&
    report.todoMarkers.length === 0 &&
    report.selfCheckIssues.length === 0 &&
    report.environmentFindings.length === 0 &&
    report.dependencyFindings.every((check) => check.status !== "unsatisfied")
  );
}

/**
 * Which of the four `docs/agents/*.md` files `forge init` generates are
 * missing at this repo root — order matches {@link REQUIRED_DOCS}, not
 * filesystem order, so a report's list is stable across runs.
 */
export function findMissingDocs(existing: ReadonlySet<string>): string[] {
  return REQUIRED_DOCS.filter((doc) => !existing.has(doc));
}

const DIRECTORY_OPTIONS = new Set(["--cwd", "--prefix", "--dir", "-C"]);

/**
 * Parses `<bun|pnpm|npm> [dir-option] run [dir-option] <script> ...`, where the
 * directory option (`--cwd`, `--prefix`, `--dir`, `-C`, each also as
 * `--opt=<dir>`) points at the package.json the script lives in. Returns null
 * when the command isn't a package-manager `run` invocation.
 */
function parsePackageManagerRun(
  command: string,
): { directory: string | null; script: string } | null {
  const [manager, ...tokens] = command.trim().split(/\s+/);
  if (manager !== "bun" && manager !== "pnpm" && manager !== "npm" && manager !== "yarn") {
    return null;
  }

  let directory: string | null = null;
  let sawRun = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const inlineDirectory = /^(?:--cwd|--prefix|--dir)=(.+)$/.exec(token);
    if (inlineDirectory) {
      directory = inlineDirectory[1]!;
    } else if (DIRECTORY_OPTIONS.has(token)) {
      directory = tokens[++index] ?? null;
    } else if (token.startsWith("-")) {
      continue;
    } else if (!sawRun) {
      if (token !== "run") return null;
      sawRun = true;
    } else {
      return { directory, script: token };
    }
  }
  return null;
}

/**
 * A `commands.selfCheck` entry "resolves" if either it's a `<packageManager>
 * run <script>` invocation and `package.json` actually declares that
 * script, or its first token is a binary genuinely on `PATH` (checked via
 * Bun Shell's built-in `which` — Bun's shell is its own minimal
 * implementation, not a real POSIX shell, so the usual `command -v` builtin
 * isn't available inside a `Bun.$` template). A command that doesn't parse
 * as either
 * shape is reported as unresolved rather than silently assumed fine —
 * `forge init` never writes anything this check wouldn't recognize, so an
 * unrecognized shape here means a human hand-edited `commands.selfCheck`
 * into something `forge doctor` can't verify, which is itself worth
 * surfacing.
 */
export async function checkSelfCheckCommand(
  repoRoot: string,
  command: string,
  packageManagerScripts: ReadonlySet<string> | null,
): Promise<string | null> {
  const packageRun = parsePackageManagerRun(command);
  if (packageRun) {
    const scripts =
      packageRun.directory === null
        ? packageManagerScripts
        : await readPackageManagerScripts(path.resolve(repoRoot, packageRun.directory));
    if (scripts === null) {
      const where = packageRun.directory === null ? "this repo" : `"${packageRun.directory}"`;
      return `"${command}" looks like a package-manager script, but ${where} has no readable package.json`;
    }
    if (!scripts.has(packageRun.script)) {
      return `"${command}" references package.json script "${packageRun.script}", which doesn't exist`;
    }
    return null;
  }

  const firstToken = command.trim().split(/\s+/)[0];
  if (!firstToken) return `empty command in commands.selfCheck`;
  if (!(await resolveBinaryOnPath(firstToken))) {
    return `"${command}": "${firstToken}" is not on PATH`;
  }
  return null;
}

async function readPackageManagerScripts(repoRoot: string): Promise<ReadonlySet<string> | null> {
  const file = Bun.file(path.join(repoRoot, "package.json"));
  if (!(await file.exists())) return null;
  try {
    const parsed: Record<string, unknown> = await file.json();
    const scripts = parsed.scripts;
    if (!isObject(scripts)) return new Set();
    return new Set(Object.keys(scripts));
  } catch {
    return null;
  }
}

/**
 * One warning per {@link DEPRECATED_CONFIG_FIELDS} dotted path that a raw
 * parsed config sets.
 */
export function findDeprecatedConfigFields(rawConfig: unknown): string[] {
  return DEPRECATED_CONFIG_FIELDS.filter((field) => {
    let node: unknown = rawConfig;
    for (const key of field.split(".")) {
      if (!isObject(node) || !(key in node)) return false;
      node = node[key];
    }
    return true;
  }).map((field) => `deprecated config field "${field}" is set; nothing reads it, remove it`);
}

/** Warns when a repo still carries the legacy `CONTEXT.md` without `GLOSSARY.md`. */
export function findGlossaryWarnings(existingFiles: ReadonlySet<string>): string[] {
  return existingFiles.has("CONTEXT.md") && !existingFiles.has("GLOSSARY.md")
    ? ["rename CONTEXT.md to GLOSSARY.md"]
    : [];
}

async function readRawConfig(repoRoot: string): Promise<unknown> {
  try {
    return await Bun.file(path.join(repoRoot, "forge.config.json")).json();
  } catch {
    return null;
  }
}

async function readSelfCheckCommands(repoRoot: string): Promise<string[]> {
  const file = Bun.file(path.join(repoRoot, "forge.config.json"));
  if (!(await file.exists())) return [];
  try {
    const parsed: Record<string, unknown> = await file.json();
    const commands = parsed.commands;
    if (!isObject(commands)) return [];
    const selfCheck = commands.selfCheck;
    if (!Array.isArray(selfCheck)) return [];
    return selfCheck.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

async function isGitRepo(targetPath: string): Promise<boolean> {
  const result = await Bun.$`git -C ${targetPath} rev-parse --show-toplevel`.nothrow().quiet();
  return result.exitCode === 0;
}

/** Flags forge shells out with, per external command. Presence of the binary
 * is not enough: a CLI release that renames or drops one of these breaks a
 * wave mid-flight, so `--help` is the contract being verified. */
const REQUIRED_CLI_FLAGS: readonly {
  readonly label: string;
  readonly command: readonly string[];
  readonly flags: readonly string[];
}[] = [
  { label: "gh issue view", command: ["gh", "issue", "view", "--help"], flags: ["--json"] },
  {
    label: "gh issue edit",
    command: ["gh", "issue", "edit", "--help"],
    flags: ["--add-label", "--remove-label"],
  },
  { label: "gh repo view", command: ["gh", "repo", "view", "--help"], flags: ["--json"] },
  { label: "claude", command: ["claude", "--help"], flags: ["--bg"] },
  { label: "claude agents", command: ["claude", "agents", "--help"], flags: ["--json"] },
];

export type EnvironmentProbes = {
  /** `--help` output of the command, or `null` when it could not be run. */
  readonly helpText: (command: readonly string[]) => Promise<string | null>;
  /** `owner/name` per `gh repo view`, or `null` when unavailable. */
  readonly ghRepoNameWithOwner: (repoRoot: string) => Promise<string | null>;
  /** URL of the named git remote, or `null` when it does not exist. */
  readonly remoteUrl: (repoRoot: string, remote: string) => Promise<string | null>;
  /** Full SHA the ref resolves to, or `null` when it does not resolve. */
  readonly resolveRef: (repoRoot: string, ref: string) => Promise<string | null>;
  /** `worktree.baseRef` from the first of repo-local/user settings that sets it. */
  readonly worktreeBaseRef: (repoRoot: string) => Promise<string | null>;
};

export function findMissingFlags(helpText: string, flags: readonly string[]): string[] {
  return flags.filter((flag) => !new RegExp(`(^|[\\s,\\[])${flag}(?![\\w-])`).test(helpText));
}

/** One finding per command whose `--help` lacks a required flag. A command
 * that cannot be run at all is reported too: dependency presence is checked
 * elsewhere, but a silent skip here would hide a half-installed CLI. */
export async function checkExternalCliFlags(probes: EnvironmentProbes): Promise<string[]> {
  const findings: string[] = [];
  for (const requirement of REQUIRED_CLI_FLAGS) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const helpText = await probes.helpText(requirement.command);
    if (helpText === null) {
      findings.push(
        `\`${requirement.command.join(" ")}\` could not be run — cannot verify ${requirement.flags.join(", ")}`,
      );
      continue;
    }
    const missing = findMissingFlags(helpText, requirement.flags);
    if (missing.length > 0) {
      findings.push(
        `${requirement.label} no longer documents ${missing.join(", ")} in --help — forge relies on it`,
      );
    }
  }
  return findings;
}

export function normalizeGithubSlug(remoteUrl: string): string | null {
  const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export type TrackerTargetInput = {
  readonly kind: TrackerKind | null;
  readonly ghRepo: string | null;
  readonly remoteUrl: string | null;
  readonly linearTeam: unknown;
};

/** github: the repo `gh` resolves must be the repo the configured remote points
 * at, else tickets get written to the wrong tracker. linear: a team must be
 * declared in `tracker.team`, since the Linear MCP has no ambient repo to infer from. */
export function checkTrackerTarget(input: TrackerTargetInput): string[] {
  if (input.kind === "github") {
    if (input.ghRepo === null || input.remoteUrl === null) return [];
    const remoteSlug = normalizeGithubSlug(input.remoteUrl);
    if (remoteSlug === null) return [];
    if (input.ghRepo.toLowerCase() !== remoteSlug) {
      return [
        `tracker.kind is github but \`gh repo view\` resolves ${input.ghRepo} while the configured remote points at ${remoteSlug} — set the gh default with \`gh repo set-default\``,
      ];
    }
    return [];
  }
  if (input.kind === "linear") {
    if (typeof input.linearTeam !== "string" || input.linearTeam.trim() === "") {
      return ["tracker.kind is linear but tracker.team is not declared in forge.config.json"];
    }
  }
  return [];
}

export type ForkBaseInput = {
  readonly coordinatorHead: string | null;
  readonly harnessBase: string | null;
  readonly baseRefSetting: string | null;
  readonly harnessBaseRef: string;
};

/** The harness forks agent worktrees from `worktree.baseRef` (default: the
 * remote trunk), not from the coordinator's HEAD. A worker forked from a stale
 * base cannot see the ticket's predecessors and merges garbage. */
export function checkWorktreeForkBase(input: ForkBaseInput): string[] {
  if (input.baseRefSetting === "head") return [];
  if (input.coordinatorHead === null || input.harnessBase === null) return [];
  if (input.coordinatorHead === input.harnessBase) return [];
  return [
    `harness worktree base ${input.harnessBaseRef} (${input.harnessBase.slice(0, 7)}) != coordinator HEAD (${input.coordinatorHead.slice(0, 7)}) — set "worktree": { "baseRef": "head" } in .claude/settings.json so workers fork from the coordinator's HEAD`,
  ];
}

async function readRawTrackerTeam(repoRoot: string): Promise<unknown> {
  try {
    const parsed: Record<string, unknown> = await Bun.file(
      path.join(repoRoot, "forge.config.json"),
    ).json();
    const tracker = parsed.tracker;
    return isObject(tracker) ? tracker.team : undefined;
  } catch {
    return undefined;
  }
}

async function runCapture(command: readonly string[], cwd: string): Promise<string | null> {
  try {
    const result = await Bun.$`${command}`.cwd(cwd).nothrow().quiet();
    if (result.exitCode !== 0) return null;
    return result.text().trim();
  } catch {
    return null;
  }
}

async function readBaseRefSetting(repoRoot: string): Promise<string | null> {
  const candidates = [
    path.join(repoRoot, ".claude", "settings.local.json"),
    path.join(repoRoot, ".claude", "settings.json"),
    path.join(os.homedir(), ".claude", "settings.json"),
  ];
  for (const candidate of candidates) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const parsed: Record<string, unknown> = await Bun.file(candidate).json();
      const worktree = parsed.worktree;
      if (isObject(worktree)) {
        const baseRef = worktree.baseRef;
        if (typeof baseRef === "string") return baseRef;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function createEnvironmentProbes(): EnvironmentProbes {
  return {
    helpText: async (command) => {
      if (!command[0] || Bun.which(command[0]) === null) return null;
      try {
        const result = await Bun.$`${command}`.nothrow().quiet();
        const text = `${result.stdout.toString()}${result.stderr.toString()}`;
        return result.exitCode === 0 || text.trim() !== "" ? text : null;
      } catch {
        return null;
      }
    },
    ghRepoNameWithOwner: (repoRoot) =>
      runCapture(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        repoRoot,
      ),
    remoteUrl: (repoRoot, remote) => runCapture(["git", "remote", "get-url", remote], repoRoot),
    resolveRef: (repoRoot, ref) =>
      runCapture(["git", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repoRoot),
    worktreeBaseRef: readBaseRefSetting,
  };
}

async function auditEnvironment(
  repoRoot: string,
  config: { readonly trunk: string; readonly remote: string; readonly kind: TrackerKind | null },
  probes: EnvironmentProbes,
): Promise<string[]> {
  const findings: string[] = [];

  findings.push(
    ...checkTrackerTarget({
      kind: config.kind,
      ghRepo: config.kind === "github" ? await probes.ghRepoNameWithOwner(repoRoot) : null,
      remoteUrl: config.kind === "github" ? await probes.remoteUrl(repoRoot, config.remote) : null,
      linearTeam: config.kind === "linear" ? await readRawTrackerTeam(repoRoot) : undefined,
    }),
  );

  const harnessBaseRef = `${config.remote}/${config.trunk}`;
  findings.push(
    ...checkWorktreeForkBase({
      coordinatorHead: await probes.resolveRef(repoRoot, "HEAD"),
      harnessBase: await probes.resolveRef(repoRoot, harnessBaseRef),
      baseRefSetting: await probes.worktreeBaseRef(repoRoot),
      harnessBaseRef,
    }),
  );
  return findings;
}

/** Audits one path. Never throws — every failure mode (not a repo, no
 * config, malformed config, missing docs) is a field on the returned
 * report, not an exception, so a fleet sweep over many paths never aborts
 * partway through on one bad repo.
 *
 * `probes` is required, not optional: an optional parameter that silently
 * skips the dependency checks when omitted is exactly the kind of implicit
 * default this repo avoids, and it would let a test "forget" the stub and
 * accidentally shell out to real binaries. Callers needing no dependency
 * checks at all still pass `createDependencyProbes()` or a stub explicitly.
 */
export async function auditRepo(
  targetPath: string,
  probes: DependencyProbes,
  environment: EnvironmentProbes,
): Promise<RepoDoctorReport> {
  const absolutePath = path.resolve(targetPath);

  if (!(await isGitRepo(absolutePath))) {
    return {
      path: absolutePath,
      isGitRepo: false,
      hasConfig: false,
      configError: null,
      missingDocs: [],
      todoMarkers: [],
      selfCheckIssues: [],
      trackerKind: null,
      dependencyFindings: [],
      maxLiveWorkersNote: null,
      environmentFindings: [],
      warnings: [],
    };
  }

  const configResult = await loadForgeConfig(absolutePath);
  const hasConfig = configResult.status === "ok";
  const configError = configResult.status === "malformed" ? configResult.reason : null;
  const trackerKind = configResult.status === "ok" ? configResult.config.tracker.kind : null;

  let maxLiveWorkersNote: string | null = null;
  if (configResult.status === "ok") {
    const pinned = configResult.config.concurrency.maxLiveWorkers;
    if (pinned !== "auto") {
      const autoCap = computeAutoMaxLiveWorkers(readHostResources());
      if (pinned < autoCap) {
        maxLiveWorkersNote = `concurrency.maxLiveWorkers is pinned at ${pinned}, below what this host could auto-compute (${autoCap}) — consider "auto" unless ${pinned} is deliberate`;
      }
    }
  }

  const environmentFindings =
    configResult.status === "ok"
      ? await auditEnvironment(
          absolutePath,
          { ...configResult.config.repo, kind: trackerKind },
          environment,
        )
      : [];

  const docsAgentsDirectory = path.join(absolutePath, "docs", "agents");
  const existingDocs = new Set(
    REQUIRED_DOCS.filter((doc) => existsSync(path.join(docsAgentsDirectory, doc))),
  );
  const missingDocs = existsSync(docsAgentsDirectory)
    ? findMissingDocs(existingDocs)
    : REQUIRED_DOCS;

  const todoMarkers = await findTodoMarkersInDocsAgents(absolutePath);

  const selfCheckCommands =
    configResult.status === "ok" ? await readSelfCheckCommands(absolutePath) : [];
  const packageManagerScripts = await readPackageManagerScripts(absolutePath);
  const selfCheckIssues: string[] = [];
  for (const command of selfCheckCommands) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const issue = await checkSelfCheckCommand(absolutePath, command, packageManagerScripts);
    if (issue) selfCheckIssues.push(issue);
  }

  /**
   * The plugin and forge-agents checks are repo-independent and printed once,
   * fleet-wide (see `main`) — only the tracker-scoped checks (gh, Linear)
   * belong to this repo.
   */
  const dependencyFindings = hasConfig
    ? (await checkDependencies({ tracker: trackerKind, repoRoot: absolutePath, probes })).filter(
        (check) =>
          check.dependency !== "claude-plugin" &&
          check.dependency !== "skills-contract" &&
          check.dependency !== "forge-agents" &&
          check.dependency !== "tracker-kind",
      )
    : [];

  return {
    path: absolutePath,
    isGitRepo: true,
    hasConfig,
    configError,
    missingDocs,
    todoMarkers,
    selfCheckIssues,
    trackerKind,
    dependencyFindings,
    maxLiveWorkersNote,
    environmentFindings,
    warnings: [
      ...findGlossaryWarnings(
        new Set(
          ["CONTEXT.md", "GLOSSARY.md"].filter((file) => existsSync(path.join(absolutePath, file))),
        ),
      ),
      ...(hasConfig ? findDeprecatedConfigFields(await readRawConfig(absolutePath)) : []),
    ],
  };
}

function formatReport(report: RepoDoctorReport): string {
  if (!report.isGitRepo) {
    return `${report.path}: not a git repository — skipped`;
  }
  if (isReportClean(report)) {
    const notes = [
      ...(report.maxLiveWorkersNote ? [report.maxLiveWorkersNote] : []),
      ...report.warnings,
    ];
    return notes.length > 0
      ? `${report.path}: OK\n${notes.map((note) => `  - note: ${note}`).join("\n")}`
      : `${report.path}: OK`;
  }

  const lines = [`${report.path}:`];
  if (!report.hasConfig && report.configError === null) {
    lines.push('  - no forge.config.json — run "forge init" here');
  }
  if (report.configError !== null) {
    lines.push(`  - forge.config.json is malformed: ${report.configError}`);
  }
  for (const doc of report.missingDocs) {
    lines.push(`  - missing docs/agents/${doc}`);
  }
  for (const marker of report.todoMarkers) {
    lines.push(`  - ${marker}`);
  }
  for (const issue of report.selfCheckIssues) {
    lines.push(`  - commands.selfCheck: ${issue}`);
  }
  for (const finding of report.environmentFindings) {
    lines.push(`  - ${finding}`);
  }
  for (const warning of report.warnings) {
    lines.push(`  - warning: ${warning}`);
  }
  for (const check of report.dependencyFindings) {
    if (check.status === "unsatisfied") {
      lines.push(`  - dependency: ${formatDependencyCheck(check, "    ")}`);
    } else if (check.status === "indeterminate") {
      lines.push(`  - note: ${formatDependencyCheck(check, "    ")}`);
    }
  }
  return lines.join("\n");
}

export function parseDoctorArguments(argv: readonly string[]): string[] {
  return argv.filter((argument) => argument !== "--all");
}

/** Prints the plugin's own status once, fleet-wide — the alternative,
 * repeating it under every one of N repos, would both spam a large sweep and
 * hide that it is one global fact, not something particular to any one repo. */
function formatGlobalDependencyFinding(check: DependencyCheck): string | null {
  if (check.status === "satisfied") return null;
  const label = check.status === "unsatisfied" ? "dependency" : "note";
  return `  - ${label}: ${formatDependencyCheck(check, "    ")}`;
}

const BYTES_PER_GIB = 1024 ** 3;

function formatGiB(bytes: number): string {
  return (bytes / BYTES_PER_GIB).toFixed(1);
}

/**
 * One line, once per sweep — this host's own numbers, the `"auto"` cap they
 * resolve to, and how many slots are actually held right now. The slot pool
 * is host-wide (see `slots.ts`), so this is never per-repo the way the rest
 * of the report is; a repo pinning below this cap gets its own
 * {@link RepoDoctorReport.maxLiveWorkersNote} instead.
 */
async function formatHostResourcesSummary(): Promise<string> {
  const resources = readHostResources();
  const autoCap = computeAutoMaxLiveWorkers(resources);
  const occupied = await listOccupiedSlots();
  const liveOccupied = occupied.filter((entry) => entry.verdict !== "dead");

  const memPart =
    resources.memAvailableBytes !== null
      ? `${formatGiB(resources.memTotalBytes)} GiB RAM (${formatGiB(resources.memAvailableBytes)} GiB available)`
      : `${formatGiB(resources.memTotalBytes)} GiB RAM`;

  const lines = [
    `Host resources: ${resources.cpuCount} vCPU, ${memPart} — "auto" would cap at ${autoCap}; ` +
      `${liveOccupied.length} slot(s) held host-wide right now.`,
  ];

  const legacyDirectory = await resolveLegacySlotsDirectory();
  if (legacyDirectory && existsSync(legacyDirectory) && readdirSync(legacyDirectory).length > 0) {
    lines.push(
      `  - note: ${legacyDirectory} still has entries — leftover from the pre-host-wide per-repo pool, safe to remove once no wave is running.`,
    );
  }

  return lines.join("\n");
}

/**
 * Advisories on `~/.claude/settings.json` keys that specifically affect
 * `/forge` — never blocking, never written by this CLI (only `install.sh`'s
 * guard-hook wiring touches that file). Personal keys (theme, OTEL, IDE
 * integration, other plugins) are deliberately out of scope: this checks
 * only what determines whether an unattended `/forge` run behaves, not the
 * user's own preferences.
 *
 * `model: "opusplan"` is what makes Phases 1-4 (plan mode) run on Opus and
 * Phase 6 onward run on Sonnet without the user touching `/model` — see the
 * README's "Models & effort" section. `permissions.defaultMode` and the
 * `git push`/`--force` deny rules are what let a wave run unattended without
 * stalling on a prompt or being able to overwrite the trunk branch.
 */
export function checkSettingsAdvisories(settings: unknown): readonly string[] {
  if (!isObject(settings)) return [];
  const advisories: string[] = [];
  const record = settings;

  if (record.model !== "opusplan") {
    advisories.push(
      'model is not "opusplan" — /forge assumes Opus plans (Phases 1-4) and Sonnet ' +
        'executes from Phase 6 on, with no /model switch needed; see the README\'s "Models & effort" section.',
    );
  }

  const permissions = isObject(record.permissions) ? record.permissions : {};
  const unattendedModes = new Set(["auto", "acceptEdits", "bypassPermissions"]);
  if (
    typeof permissions.defaultMode !== "string" ||
    !unattendedModes.has(permissions.defaultMode)
  ) {
    advisories.push(
      "permissions.defaultMode is not one that can run unattended (auto/acceptEdits/bypassPermissions) — " +
        "a /forge wave will stall on a permission prompt with no one there to answer it.",
    );
  }

  const denyRules = Array.isArray(permissions.deny)
    ? permissions.deny.filter((rule): rule is string => typeof rule === "string")
    : [];
  if (!denyRules.some((rule) => /git push[^)]*\b(main|master)\b/.test(rule))) {
    advisories.push(
      "no permissions.deny rule blocks `git push * main|master` — recommended before running /forge unattended.",
    );
  }
  if (!denyRules.some((rule) => /git push[^)]*--force/.test(rule))) {
    advisories.push(
      "no permissions.deny rule blocks `git push --force *` — recommended before running /forge unattended.",
    );
  }

  return advisories;
}

const INSTALL_MANIFEST_RELATIVE_PATH = ".claude/forge/.install-manifest.json";

/**
 * Compares every file recorded in the installer's SHA-256 manifest against
 * what is on disk now. Returns one human-readable line per edited or missing
 * file; an absent or unreadable manifest yields no findings (nothing to compare).
 */
export async function findInstallDrift(homeDirectory: string): Promise<string[]> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      await readFile(path.join(homeDirectory, INSTALL_MANIFEST_RELATIVE_PATH), "utf8"),
    );
  } catch {
    return [];
  }
  if (typeof manifest !== "object" || manifest === null) return [];

  const findings: string[] = [];
  for (const [relativePath, expectedHash] of Object.entries(manifest)) {
    const absolutePath = path.join(homeDirectory, relativePath);
    let currentHash: string;
    try {
      currentHash = createHash("sha256")
        // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
        .update(await readFile(absolutePath))
        .digest("hex");
    } catch {
      findings.push(`~/${relativePath} is missing — re-run install.sh`);
      continue;
    }
    if (currentHash !== expectedHash) {
      const pendingNote = existsSync(`${absolutePath}.new`)
        ? ` (new version waiting at ~/${relativePath}.new)`
        : "";
      findings.push(`~/${relativePath} was edited since install${pendingNote}`);
    }
  }
  return findings;
}

/**
 * Warns when forge is installed both as a plugin and by `install.sh` (the
 * installer's manifest is present), which would load two copies of the
 * `/forge` command and agents.
 */
export function findDoubleInstall(
  homeDirectory: string,
  plugins: readonly InstalledPlugin[],
): string[] {
  const installedByScript = existsSync(path.join(homeDirectory, INSTALL_MANIFEST_RELATIVE_PATH));
  if (!installedByScript || findPluginByName(plugins, "forge") === null) return [];
  return [
    "forge is installed both as a plugin and by install.sh; remove one (uninstall the plugin, or delete ~/.claude/forge, ~/.claude/commands/forge.md and the forge agents)",
  ];
}

async function readUserSettings(): Promise<unknown> {
  const file = Bun.file(path.join(os.homedir(), ".claude", "settings.json"));
  if (!(await file.exists())) return null;
  try {
    return await file.json();
  } catch {
    return null;
  }
}

async function main(targets: readonly string[]): Promise<void> {
  const paths = targets.length > 0 ? targets : ["."];
  const probes = createDependencyProbes();
  const environment = createEnvironmentProbes();

  const reports: RepoDoctorReport[] = [];
  for (const target of paths) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    reports.push(await auditRepo(target, probes, environment));
  }

  for (const report of reports) {
    console.log(formatReport(report));
  }

  console.log(`\n${await formatHostResourcesSummary()}`);

  const globalPluginCheck = classifyClaudePluginProbe(await probes.claudePlugin());
  const globalForgeAgentsCheck = classifyForgeAgentsProbe(await probes.forgeAgents());
  const skillsChecks = probes.skillsContract?.() ?? checkSkillsContract();
  const doubleInstall = findDoubleInstall(os.homedir(), listInstalledPlugins());
  const globalFindingLines = [globalPluginCheck, globalForgeAgentsCheck, ...skillsChecks]
    .map(formatGlobalDependencyFinding)
    .filter((line): line is string => line !== null);
  if (globalFindingLines.length > 0) {
    console.log(`\nGlobal dependencies:\n${globalFindingLines.join("\n")}`);
  }

  if (doubleInstall.length > 0) {
    console.log(`\nDouble install:\n${doubleInstall.map((line) => `  - ${line}`).join("\n")}`);
  }

  const cliFlagFindings = await checkExternalCliFlags(environment);
  if (cliFlagFindings.length > 0) {
    console.log(
      `\nExternal CLI flags (verified via --help):\n${cliFlagFindings.map((line) => `  - ${line}`).join("\n")}`,
    );
  }

  const settingsAdvisories = checkSettingsAdvisories(await readUserSettings());
  if (settingsAdvisories.length > 0) {
    console.log(
      `\nSettings advisories (~/.claude/settings.json, never auto-fixed):\n${settingsAdvisories
        .map((advisory) => `  - ${advisory}`)
        .join("\n")}`,
    );
  }

  const installDrift = await findInstallDrift(os.homedir());
  if (installDrift.length > 0) {
    console.log(
      `\nInstall drift (informational — install.sh keeps your edits and writes <file>.new):\n${installDrift
        .map((line) => `  - ${line}`)
        .join("\n")}`,
    );
  }

  const cleanCount = reports.filter((report) => isReportClean(report)).length;
  const gitRepoCount = reports.filter((report) => report.isGitRepo).length;
  console.log(
    `\n${cleanCount}/${gitRepoCount} repos clean (${reports.length - gitRepoCount} skipped, not a git repo).`,
  );

  const exitClean =
    cleanCount === gitRepoCount &&
    cliFlagFindings.length === 0 &&
    globalPluginCheck.status !== "unsatisfied" &&
    globalForgeAgentsCheck.status !== "unsatisfied" &&
    skillsChecks.every((check) => check.status !== "unsatisfied");
  process.exitCode = exitClean ? 0 : 1;
}

export async function run(argv: string[]): Promise<void> {
  try {
    const targets = parseDoctorArguments(argv);
    await main(targets);
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = process.exitCode ?? 3;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
