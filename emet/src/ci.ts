/** `emet ci`: wait for a PR's checks and report the outcome, never merging. */

import { BINARY } from "./names";
import {
  classifyChecks,
  isCodeFailure,
  isUnfinished,
  parseCheckRollup,
  type RawCheck,
} from "./status";

/** Runs `gh` with the given arguments and resolves with its stdout; rejects when `gh` fails. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

export interface CiOutcome {
  state: "pass" | "fail" | "env-fault" | "timeout";
  failedChecks: string[];
  flakeReruns: number;
  noChecks: boolean;
}

export interface WaitForChecksOptions {
  pr: number;
  timeoutMs: number;
  pollMs: number;
  rerunFlakes: boolean;
}

export interface WaitForChecksDeps {
  gh: GhRunner;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const QUEUED_STALE_MS = 30 * 60 * 1000;
const RUN_ID_PATTERN = /\/actions\/runs\/(\d+)/;

function failedCheckNames(checks: readonly RawCheck[]): string[] {
  return checks.filter(isCodeFailure).map((check) => check.name ?? "unnamed check");
}

function failedRunIds(checks: readonly RawCheck[]): string[] {
  const ids = new Set<string>();
  for (const check of checks.filter(isCodeFailure)) {
    const id = RUN_ID_PATTERN.exec(check.detailsUrl ?? "")?.[1];
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

async function rerunFailed(gh: GhRunner, checks: readonly RawCheck[]): Promise<void> {
  await Promise.all(failedRunIds(checks).map((id) => gh(["run", "rerun", id, "--failed"])));
}

/**
 * Polls a PR's checks until they finish or `timeoutMs` passes. With
 * `rerunFlakes`, the first batch of failed checks is rerun once; a check that
 * passes on the rerun counts as a flake, one that fails again is a failure.
 */
export async function waitForChecks(
  options: WaitForChecksOptions,
  deps: WaitForChecksDeps,
): Promise<CiOutcome> {
  const startedMs = deps.now();
  let flakeReruns = 0;
  let rerunDone = false;
  let skipEvaluation = false;
  for (;;) {
    if (!skipEvaluation) {
      const viewArgs = ["pr", "view", String(options.pr), "--json", "statusCheckRollup"];
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each poll depends on the previous one
      const checks = parseCheckRollup(await deps.gh(viewArgs));
      const state = classifyChecks(checks, {
        nowMs: deps.now(),
        queuedStaleMs: QUEUED_STALE_MS,
      });
      const unfinished = checks.some(isUnfinished);
      if (state === "none") {
        return { state: "pass", failedChecks: [], flakeReruns, noChecks: true };
      }
      if (state === "passing") {
        return { state: "pass", failedChecks: [], flakeReruns, noChecks: false };
      }
      if (state === "env-fault") {
        return { state: "env-fault", failedChecks: [], flakeReruns, noChecks: false };
      }
      if (state === "failing" && !unfinished) {
        if (options.rerunFlakes && !rerunDone) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: polling depends on the rerun having been requested
          await rerunFailed(deps.gh, checks);
          flakeReruns = failedCheckNames(checks).length;
          rerunDone = true;
          skipEvaluation = true;
        } else {
          return {
            state: "fail",
            failedChecks: failedCheckNames(checks),
            flakeReruns,
            noChecks: false,
          };
        }
      }
      if (deps.now() - startedMs >= options.timeoutMs) {
        return {
          state: "timeout",
          failedChecks: failedCheckNames(checks),
          flakeReruns,
          noChecks: false,
        };
      }
    } else {
      skipEvaluation = false;
      if (deps.now() - startedMs >= options.timeoutMs) {
        return { state: "timeout", failedChecks: [], flakeReruns, noChecks: false };
      }
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: polling waits between reads
    await deps.sleep(options.pollMs);
  }
}

export function run(_argv: string[]): Promise<void> {
  console.error(`${BINARY} ci: not implemented`);
  process.exitCode = 2;
  return Promise.resolve();
}
