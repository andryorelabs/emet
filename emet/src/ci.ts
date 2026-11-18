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

function failureSignature(checks: readonly RawCheck[]): string {
  return checks
    .filter(isCodeFailure)
    .map((check) => `${check.name ?? ""}|${check.detailsUrl ?? ""}|${check.startedAt ?? ""}`)
    .toSorted()
    .join("\n");
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
  let staleSignature: string | undefined;
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
      if (
        staleSignature !== undefined &&
        (unfinished || failureSignature(checks) !== staleSignature)
      ) {
        staleSignature = undefined;
      }
      if (state === "failing" && !unfinished && staleSignature === undefined) {
        if (options.rerunFlakes && !rerunDone && failedRunIds(checks).length > 0) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: polling depends on the rerun having been requested
          await rerunFailed(deps.gh, checks);
          flakeReruns = failedCheckNames(checks).length;
          staleSignature = failureSignature(checks);
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

const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_POLL_SECONDS = 30;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_TIMEOUT = 3;
const USAGE = `usage: ${BINARY} ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <n>] [--poll-seconds <n>]`;
const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  "--pr",
  "--wait",
  "--rerun-flakes",
  "--timeout-minutes",
  "--poll-seconds",
  "--json",
]);
const VALUE_FLAGS: ReadonlySet<string> = new Set(["--pr", "--timeout-minutes", "--poll-seconds"]);

class CiUsageError extends Error {}

function positiveNumber(argv: readonly string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const raw = argv[index + 1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new CiUsageError(`invalid ${flag}\n${USAGE}`);
  return value;
}

function parseCiArguments(argv: readonly string[]): {
  options: WaitForChecksOptions;
  pollMs: number;
} {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!KNOWN_FLAGS.has(token)) throw new CiUsageError(`unknown argument "${token}"\n${USAGE}`);
    if (VALUE_FLAGS.has(token)) index += 1;
  }
  const pr = positiveNumber(argv, "--pr", Number.NaN);
  if (!Number.isInteger(pr) || !argv.includes("--wait")) throw new CiUsageError(USAGE);
  const pollMs = positiveNumber(argv, "--poll-seconds", DEFAULT_POLL_SECONDS) * 1000;
  const timeoutMs = positiveNumber(argv, "--timeout-minutes", DEFAULT_TIMEOUT_MINUTES) * 60_000;
  return {
    options: { pr, timeoutMs, pollMs, rerunFlakes: argv.includes("--rerun-flakes") },
    pollMs,
  };
}

/** Runs `gh` for real and resolves with its stdout, rejecting with its stderr on a non-zero exit. */
export const realGh: GhRunner = async (args) => {
  const result = await Bun.$`gh ${args}`.nothrow().quiet();
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `gh exited ${result.exitCode}`);
  }
  return result.stdout.toString();
};

function exitCodeFor(state: CiOutcome["state"]): number {
  if (state === "pass") return 0;
  return state === "timeout" ? EXIT_TIMEOUT : EXIT_FAILED;
}

/**
 * Entry point of `emet ci --pr <n> --wait`: prints the outcome as JSON and
 * exits 0 on pass, 1 on fail or env-fault, 3 on timeout, 2 on bad arguments.
 */
export async function run(
  argv: string[],
  deps: WaitForChecksDeps = {
    gh: realGh,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  },
): Promise<void> {
  try {
    const { options } = parseCiArguments(argv);
    const outcome = await waitForChecks(options, deps);
    console.log(JSON.stringify(outcome));
    process.exitCode = exitCodeFor(outcome.state);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof CiUsageError ? EXIT_USAGE : EXIT_FAILED;
  }
}
