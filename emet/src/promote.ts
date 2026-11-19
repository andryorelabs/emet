/** `emet promote`: the after-spec step that promotes `develop` to `main` once a spec has landed. */

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
import { BINARY } from "./names";
import { errorMessage } from "./narrow";

const DEVELOP_BRANCH = "develop";
const MAIN_BRANCH = "main";
const PROMOTE_TITLE = "chore: 🔖 promote develop";
const SYNC_TITLE = "chore: 🔖 sync main into develop";
const CI_TIMEOUT_MS = 30 * 60 * 1000;
const CI_POLL_MS = 30 * 1000;
const PR_URL_PATTERN = /\/pull\/(\d+)/;

/** What `promoteDevelop` did. */
export interface PromoteOutcome {
  mode: AfterSpecMode;
  prNumber: number | null;
  merged: boolean;
  syncPrNumber: number | null;
  skipped?: string;
  ciState?: string;
}

/** Test seams for `promoteDevelop`. */
export interface PromoteDeps {
  mode: AfterSpecMode;
  gh: GhRunner;
  waitForCi: (pr: number) => Promise<CiOutcome>;
  record: (outcome: PromoteOutcome) => void;
}

/**
 * Decides the after-spec step for a run: `none` under `--no-promote` or when
 * the spec's last wave was left open or flagged, otherwise the configured mode.
 */
export function planAfterSpec(
  config: Pick<ForgeConfig, "handoff">,
  options: { noPromote: boolean; finalWaveClean: boolean },
): AfterSpecMode {
  if (options.noPromote || !options.finalWaveClean) return "none";
  return config.handoff.afterSpec;
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

async function promoteViaPullRequest(
  options: { dryRun: boolean },
  deps: PromoteDeps,
): Promise<PromoteOutcome> {
  const outcome: PromoteOutcome = {
    mode: "promote",
    prNumber: null,
    merged: false,
    syncPrNumber: null,
  };
  if (options.dryRun) return { ...outcome, skipped: "dry run" };
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
  options: { dryRun: boolean },
  deps: PromoteDeps,
): Promise<PromoteOutcome> {
  if (deps.mode === "none") {
    return {
      mode: "none",
      prNumber: null,
      merged: false,
      syncPrNumber: null,
      skipped: "after-spec is none",
    };
  }
  if (deps.mode === "release") {
    return {
      mode: "release",
      prNumber: null,
      merged: false,
      syncPrNumber: null,
      skipped: "release mode stops for a person: open the release pull request with cut-release",
    };
  }
  return promoteViaPullRequest(options, deps);
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** Entry point of `emet promote --spec <id> [--dry-run] [--no-promote]`. */
export async function run(argv: string[], overrides: Partial<PromoteDeps> = {}): Promise<void> {
  try {
    const specId = readFlag(argv, "--spec");
    if (specId === undefined || specId === "") {
      throw new ForgeConfigError(`usage: ${BINARY} promote --spec <id> [--dry-run] [--no-promote]`);
    }
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) throw new ForgeConfigError(`${BINARY} promote: not inside a git repository`);
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const mode = planAfterSpec(config, {
      noPromote: argv.includes("--no-promote"),
      finalWaveClean: true,
    });
    const outcome = await promoteDevelop(
      { dryRun: argv.includes("--dry-run") },
      {
        mode,
        gh: realGh,
        waitForCi: (pr) =>
          waitForChecks(
            { pr, timeoutMs: CI_TIMEOUT_MS, pollMs: CI_POLL_MS, rerunFlakes: false },
            {
              gh: realGh,
              sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
              now: Date.now,
            },
          ),
        record: (result) => {
          appendEvent({
            kind: "promote",
            repo: repoRoot,
            origin: "auto",
            data: {
              spec: specId,
              mode: result.mode,
              prNumber: result.prNumber,
              merged: result.merged,
              syncPrNumber: result.syncPrNumber,
              ciState: result.ciState ?? null,
            },
          });
        },
        ...overrides,
      },
    );
    console.log(JSON.stringify(outcome));
    const failed = outcome.mode === "promote" && outcome.skipped === undefined && !outcome.merged;
    if (failed) process.exitCode = exitCodes.findings;
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = error instanceof ForgeConfigError ? exitCodes.usage : exitCodes.findings;
  }
}
