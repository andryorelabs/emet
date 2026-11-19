/** `emet promote`: the after-spec step that promotes `develop` to `main` once a spec has landed. */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { matchesAnyGlob, resolveAfterSpec, type AfterSpecResolution } from "./afterspec";
import { realGh, waitForChecks, type CiOutcome, type GhRunner } from "./ci";
import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type AfterSpecMode,
  type ForgeConfig,
} from "./config";
import { exitCodes } from "./exit-codes";
import { appendEvent } from "./journal";
import { resolveLockDirectory } from "./locks";
import { BINARY, resolveRunDir } from "./names";
import { errorMessage } from "./narrow";
import { assertSafeId } from "./runs";

const DEVELOP_BRANCH = "develop";
const MAIN_BRANCH = "main";
const PROMOTE_TITLE = "chore: 🔖 promote develop";
const SYNC_TITLE = "chore: 🔖 sync main into develop";
const CI_TIMEOUT_MS = 30 * 60 * 1000;
const CI_POLL_MS = 30 * 1000;
const PR_URL_PATTERN = /\/pull\/(\d+)/;

type DeployCheckConfig = NonNullable<NonNullable<ForgeConfig["deploy"]>["check"]>;

/** Whether the coordinator should run `emet deploy-check`, and one sentence saying why. */
export interface DeployCheckDecision {
  readonly run: boolean;
  readonly reason: string;
}

/** What `promoteDevelop` did. */
export interface PromoteOutcome {
  mode: AfterSpecMode;
  rule: number | null;
  reason: string;
  prNumber: number | null;
  merged: boolean;
  syncPrNumber: number | null;
  deployCheck: DeployCheckDecision;
  skipped?: string;
  ciState?: string;
}

/** Test seams for `promoteDevelop`. */
export interface PromoteDeps {
  mode: AfterSpecMode;
  gh: GhRunner;
  waitForCi: (pr: number) => Promise<CiOutcome>;
  record: (outcome: PromoteOutcome) => void;
  readChangedPaths: () => Promise<readonly string[]>;
}

/** What `promoteDevelop` reports beyond its own actions: the resolution and the deploy decision. */
export interface PromoteReport {
  dryRun: boolean;
  resolution?: AfterSpecResolution;
  decideDeployCheck?: (promoteMerged: boolean) => DeployCheckDecision;
}

const NO_DEPLOY_CHECK: DeployCheckDecision = { run: false, reason: "no deploy check configured" };

/**
 * Decides the after-spec step for a run: `none` under `--no-promote` or when
 * the spec's last wave was left open or flagged, otherwise the configured
 * setting resolved against the changed paths.
 */
export function planAfterSpec(
  config: Pick<ForgeConfig, "handoff">,
  options: { noPromote: boolean; finalWaveClean: boolean; changedPaths: readonly string[] },
): AfterSpecResolution {
  if (options.noPromote) {
    return { mode: "none", ruleIndex: null, reason: "the after-spec step is held or --no-promote" };
  }
  if (!options.finalWaveClean) {
    return { mode: "none", ruleIndex: null, reason: "the final wave is not clean" };
  }
  return resolveAfterSpec(config.handoff.afterSpec, options.changedPaths);
}

/**
 * Whether the deploy check should run: only with a check configured and a
 * clean final wave. On trunk `main` every merge deploys, so it runs whatever
 * the mode. Otherwise it runs only after a promote that merged and, when the
 * check has `paths`, carried a matching changed path.
 */
export function decideDeployCheck(input: {
  check: DeployCheckConfig | undefined;
  trunk: string;
  mode: AfterSpecMode;
  finalWaveClean: boolean;
  promoteMerged: boolean;
  changedPaths: readonly string[];
}): DeployCheckDecision {
  if (input.check === undefined) return NO_DEPLOY_CHECK;
  if (!input.finalWaveClean) {
    return { run: false, reason: "the final wave is not clean" };
  }
  if (input.trunk === MAIN_BRANCH) {
    return {
      run: true,
      reason: `trunk is ${MAIN_BRANCH}, so every merge deploys and the check runs after a clean final wave`,
    };
  }
  if (input.mode === "release") {
    return { run: false, reason: "release mode: the deploy waits for a person" };
  }
  if (input.mode !== "promote") {
    return { run: false, reason: `after-spec is ${input.mode}: nothing reached ${MAIN_BRANCH}` };
  }
  if (!input.promoteMerged) {
    return { run: false, reason: "the promote pull request did not merge" };
  }
  const globs = input.check.paths;
  if (globs === undefined) {
    return { run: true, reason: "the promote merged and deploy.check has no paths filter" };
  }
  if (input.changedPaths.some((changed) => matchesAnyGlob(globs, changed))) {
    return {
      run: true,
      reason: "the promote merged and a changed path matches deploy.check.paths",
    };
  }
  return {
    run: false,
    reason: "the promote merged but no changed path matches deploy.check.paths",
  };
}

/**
 * The paths promoting `develop` would carry into `main`: a fetch of both
 * branches, then a NUL-separated, rename-free diff. A failure throws, so it
 * never reads as "no paths".
 */
export async function readChangedPaths(repoRoot: string): Promise<string[]> {
  const fetched = await Bun.$`git -C ${repoRoot} fetch origin ${MAIN_BRANCH} ${DEVELOP_BRANCH}`
    .nothrow()
    .quiet();
  if (fetched.exitCode !== 0) {
    throw new Error(`git fetch failed: ${fetched.stderr.toString().trim()}`);
  }
  const range = `origin/${MAIN_BRANCH}...origin/${DEVELOP_BRANCH}`;
  const diffed = await Bun.$`git -C ${repoRoot} diff --name-only --no-renames -z ${range}`
    .nothrow()
    .quiet();
  if (diffed.exitCode !== 0) {
    throw new Error(`git diff failed: ${diffed.stderr.toString().trim()}`);
  }
  return diffed.stdout
    .toString()
    .split("\0")
    .filter((entry) => entry !== "");
}

function parsePullRequestNumber(output: string): number {
  const match = PR_URL_PATTERN.exec(output);
  if (match?.[1] === undefined) {
    throw new Error(`could not read a pull request number from: ${output.trim()}`);
  }
  return Number(match[1]);
}

async function openPullRequest(
  gh: GhRunner,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<number> {
  const output = await gh([
    "pr",
    "create",
    "--head",
    head,
    "--base",
    base,
    "--title",
    title,
    "--body",
    body,
  ]);
  return parsePullRequestNumber(output);
}

async function isDevelopBehindMain(gh: GhRunner): Promise<boolean> {
  const output = await gh([
    "api",
    `repos/{owner}/{repo}/compare/${DEVELOP_BRANCH}...${MAIN_BRANCH}`,
    "--jq",
    ".ahead_by",
  ]);
  return Number(output.trim()) > 0;
}

function baseOutcome(
  mode: AfterSpecMode,
  report: PromoteReport,
  promoteMerged: boolean,
): PromoteOutcome {
  return {
    mode,
    rule: report.resolution?.ruleIndex ?? null,
    reason: report.resolution?.reason ?? `after-spec is ${mode}`,
    prNumber: null,
    merged: promoteMerged,
    syncPrNumber: null,
    deployCheck: report.decideDeployCheck?.(promoteMerged) ?? NO_DEPLOY_CHECK,
  };
}

async function promoteViaPullRequest(
  report: PromoteReport,
  deps: PromoteDeps,
): Promise<PromoteOutcome> {
  const outcome = baseOutcome("promote", report, false);
  if (report.dryRun) return { ...outcome, skipped: "dry run" };
  outcome.prNumber = await openPullRequest(
    deps.gh,
    DEVELOP_BRANCH,
    MAIN_BRANCH,
    PROMOTE_TITLE,
    "Promotes develop to main after a spec landed.",
  );
  try {
    const ci = await deps.waitForCi(outcome.prNumber);
    outcome.ciState = ci.state;
    if (ci.state !== "pass") return outcome;
    await deps.gh(["pr", "merge", String(outcome.prNumber), "--merge"]);
    outcome.merged = true;
    outcome.deployCheck = report.decideDeployCheck?.(true) ?? NO_DEPLOY_CHECK;
    if (await isDevelopBehindMain(deps.gh)) {
      outcome.syncPrNumber = await openPullRequest(
        deps.gh,
        MAIN_BRANCH,
        DEVELOP_BRANCH,
        SYNC_TITLE,
        "Brings the promote merge commit back into develop.",
      );
      await deps.gh(["pr", "merge", String(outcome.syncPrNumber), "--merge"]);
    }
    return outcome;
  } finally {
    deps.record(outcome);
  }
}

/**
 * Runs the after-spec step. `promote` opens `develop` to `main`, waits for CI,
 * merges only on `pass`, and opens and merges a sync pull request back only
 * when `develop` is behind `main`. `release` opens nothing here: a person cuts
 * the release. `none` does nothing.
 */
export async function promoteDevelop(
  options: PromoteReport,
  deps: PromoteDeps,
): Promise<PromoteOutcome> {
  if (deps.mode === "none") {
    return { ...baseOutcome("none", options, false), skipped: "after-spec is none" };
  }
  if (deps.mode === "release") {
    return {
      ...baseOutcome("release", options, false),
      skipped: "release mode stops for a person: open the release pull request with cut-release",
    };
  }
  return promoteViaPullRequest(options, deps);
}

/** Reads the aggregate wave state out of the text `emet status --spec <id>` prints. */
export function parseSpecState(text: string, specId: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw new Error(`could not read the state of spec ${specId} from ${BINARY} status`);
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof parsed === "object" && parsed !== null && "state" in parsed) {
    return String(parsed.state);
  }
  throw new Error(`${BINARY} status printed no state for spec ${specId}`);
}

/** Reads a spec's aggregate wave state through `emet status --spec <id>`. */
export async function readSpecState(specId: string): Promise<string> {
  const result = await Bun.$`${BINARY} status --spec ${specId}`.nothrow().quiet();
  return parseSpecState(result.stdout.toString(), specId);
}

/** A spec's last wave is clean only when no wave is working, checking, ready or waiting on a decision. */
export function isFinalWaveClean(state: string): boolean {
  return state === "idle";
}

/** The real `gh`, CI wait and journal record behind `promoteDevelop`; `gh` and `append` are test seams. */
export function buildPromoteDeps(options: {
  mode: AfterSpecMode;
  repoRoot: string;
  specId: string;
  gh?: GhRunner;
  append?: typeof appendEvent;
}): PromoteDeps {
  const gh = options.gh ?? realGh;
  const append = options.append ?? appendEvent;
  return {
    mode: options.mode,
    gh,
    readChangedPaths: () => readChangedPaths(options.repoRoot),
    waitForCi: (pr) =>
      waitForChecks(
        { pr, timeoutMs: CI_TIMEOUT_MS, pollMs: CI_POLL_MS, rerunFlakes: false },
        {
          gh,
          sleep: Bun.sleep,
          now: Date.now,
        },
      ),
    record: (result) => {
      append({
        kind: "promote",
        repo: options.repoRoot,
        origin: "auto",
        data: {
          spec: options.specId,
          mode: result.mode,
          rule: result.rule,
          reason: result.reason,
          deployCheck: { run: result.deployCheck.run, reason: result.deployCheck.reason },
          prNumber: result.prNumber,
          merged: result.merged,
          syncPrNumber: result.syncPrNumber,
          ciState: result.ciState ?? null,
        },
      });
    },
  };
}

/**
 * The marker that holds a spec's after-spec step, under the git common dir so
 * every worktree of the repo shares it: `<common dir>/.emet/runs/<spec id>/no-promote`.
 */
export function holdMarkerPath(commonDirectory: string, specId: string): string {
  assertSafeId("spec id", specId);
  return path.join(resolveRunDir(commonDirectory).path, "runs", specId, "no-promote");
}

/** The per-checkout location an earlier `--hold` could have used. */
function legacyHoldMarkerPath(repoRoot: string, specId: string): string {
  return path.join(resolveRunDir(repoRoot).path, "runs", specId, "no-promote");
}

/** Whether `emet promote --spec <id> --hold` was run for this spec, in the shared or the per-checkout location. */
export function isSpecHeld(commonDirectory: string, repoRoot: string, specId: string): boolean {
  return (
    existsSync(holdMarkerPath(commonDirectory, specId)) ||
    existsSync(legacyHoldMarkerPath(repoRoot, specId))
  );
}

/** Writes the hold marker so every later session of the spec skips the after-spec step. */
export function holdSpec(commonDirectory: string, specId: string): void {
  const marker = holdMarkerPath(commonDirectory, specId);
  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, "");
}

function needsChangedPaths(
  config: Pick<ForgeConfig, "handoff" | "repo" | "deploy">,
  options: { noPromote: boolean; finalWaveClean: boolean },
): boolean {
  if (options.noPromote || !options.finalWaveClean) return false;
  if (config.repo.trunk !== DEVELOP_BRANCH) return false;
  return Array.isArray(config.handoff.afterSpec) || config.deploy?.check?.paths !== undefined;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** Entry point of `emet promote --spec <id> [--dry-run] [--no-promote] [--hold]`. */
export async function run(
  argv: string[],
  overrides: Partial<PromoteDeps> & {
    specState?: (specId: string) => Promise<string>;
    repoRoot?: string;
    commonDirectory?: string;
  } = {},
): Promise<void> {
  try {
    const specId = readFlag(argv, "--spec");
    if (specId === undefined || specId === "" || specId.startsWith("-")) {
      throw new ForgeConfigError(
        `usage: ${BINARY} promote --spec <id> [--dry-run] [--no-promote] [--hold]`,
      );
    }
    assertSafeId("spec id", specId);
    const {
      specState,
      repoRoot: repoRootOverride,
      commonDirectory: commonDirectoryOverride,
      ...promoteOverrides
    } = overrides;
    const commonDirectory =
      commonDirectoryOverride ?? (await resolveLockDirectory("promote hold marker"));
    if (argv.includes("--hold")) {
      holdSpec(commonDirectory, specId);
      console.log(JSON.stringify({ held: true }));
      return;
    }
    const repoRoot = repoRootOverride ?? (await resolveRepoRoot());
    if (!repoRoot) throw new ForgeConfigError(`${BINARY} promote: not inside a git repository`);
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const noPromote =
      argv.includes("--no-promote") || isSpecHeld(commonDirectory, repoRoot, specId);
    const finalWaveClean = isFinalWaveClean(await (specState ?? readSpecState)(specId));
    const base = { ...buildPromoteDeps({ mode: "none", repoRoot, specId }), ...promoteOverrides };
    const changedPaths = needsChangedPaths(config, { noPromote, finalWaveClean })
      ? await base.readChangedPaths()
      : [];
    const resolution = planAfterSpec(config, { noPromote, finalWaveClean, changedPaths });
    const deps: PromoteDeps = { ...base, mode: resolution.mode, ...promoteOverrides };
    const outcome = await promoteDevelop(
      {
        dryRun: argv.includes("--dry-run"),
        resolution,
        decideDeployCheck: (promoteMerged) =>
          decideDeployCheck({
            check: config.deploy?.check,
            trunk: config.repo.trunk,
            mode: deps.mode,
            finalWaveClean,
            promoteMerged,
            changedPaths,
          }),
      },
      deps,
    );
    console.log(JSON.stringify(outcome));
    const failed = outcome.mode === "promote" && outcome.skipped === undefined && !outcome.merged;
    if (failed) process.exitCode = exitCodes.findings;
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = error instanceof ForgeConfigError ? exitCodes.usage : exitCodes.findings;
  }
}
