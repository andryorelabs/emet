import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The one `runs-on` expression a routed job may use (ADR-0017). Fork PRs always stay on GitHub-hosted runners. */
export const ROUTED_RUNS_ON =
  "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}";

/** The action every job starts with, to audit its network egress. */
export const HARDEN_RUNNER_ACTION = "step-security/harden-runner";

/** Jobs that run on `ROUTED_RUNS_ON`, keyed `file:job`, each with why routing is safe and worth it. */
export const ROUTED_JOBS: readonly { key: string; reason: string }[] = [
  { key: "ci.yml:check", reason: "Linux typecheck, lint and docs checks; light and frequent" },
  { key: "ci.yml:test", reason: "Linux test suite with the coverage gate; light and frequent" },
  { key: "ci.yml:bun-canary", reason: "non-required latest-Bun test run; Linux only" },
  { key: "ci.yml:commitlint", reason: "lints commit messages; seconds of Linux time" },
  { key: "ci.yml:ci-passed", reason: "aggregates job results; no checkout" },
  { key: "codeql.yml:analyze", reason: "build-mode none needs no toolchain, only a Linux runner" },
  { key: "labels.yml:sync", reason: "syncs labels through the API; seconds of Linux time" },
  { key: "lint-docs.yml:check-links", reason: "offline lychee link check; light and frequent" },
  { key: "lint-pr.yml:validate-title", reason: "validates the PR title through the API" },
  { key: "lint-workflows.yml:lint", reason: "actionlint and zizmor on Linux; light" },
];

/** Jobs pinned to a literal GitHub-hosted runner, keyed `file:job`, each with why they must not be routed. */
export const LITERAL_JOBS: readonly { key: string; runner: string; reason: string }[] = [
  {
    key: "ci.yml:test-macos",
    runner: "macos-latest",
    reason: "macOS support (ADR-0007); Blacksmith has no macOS runner",
  },
  {
    key: "scorecard.yml:analysis",
    runner: "ubuntu-latest",
    reason: "publish_results requires a GitHub-hosted runner",
  },
  {
    key: "release.yml:verify",
    runner: "ubuntu-latest",
    reason: "release provenance needs GitHub-hosted runners",
  },
  {
    key: "release.yml:release",
    runner: "ubuntu-latest",
    reason: "release provenance and attestation need GitHub-hosted runners",
  },
  {
    key: "deploy-site.yml:deploy",
    runner: "ubuntu-latest",
    reason: "holds the Coolify token; keep it off third-party runners",
  },
];

/** A rule that a target (`file` or `file:job`) does not meet yet, because another ticket owns that file. */
interface PendingRule {
  readonly target: string;
  readonly rule: "concurrency" | "harden-runner" | "main-guard";
  readonly reason: string;
}

/** Rules waiting on the ticket that owns the target file. Remove an entry when that ticket lands. */
export const PENDING_RULES: readonly PendingRule[] = [
  { target: "release.yml", rule: "concurrency", reason: "release.yml belongs to T15 (#538)" },
  { target: "release.yml:verify", rule: "harden-runner", reason: "T15 (#538) hardens release" },
  { target: "release.yml:release", rule: "harden-runner", reason: "T15 (#538) hardens release" },
  {
    target: "deploy-site.yml:deploy",
    rule: "harden-runner",
    reason: "deploy-site.yml belongs to the site hardening ticket (#534)",
  },
  {
    target: "deploy-site.yml:deploy",
    rule: "main-guard",
    reason: "deploy-site.yml belongs to the site hardening ticket (#534)",
  },
];

const MAIN_GUARD = "github.ref == 'refs/heads/main'";
const BUN_RUN_PATTERN = /\bbun run ([^\s;&|)]+)/g;
const OTHER_PACKAGE_MANAGER_PATTERN = /(?:^|[\s;&|(])(?:npm|npx|pnpm|yarn)\s/;

/** A job entry as far as these rules read it. */
interface JobShape {
  readonly "runs-on"?: unknown;
  readonly uses?: unknown;
  readonly if?: unknown;
  readonly steps?: unknown;
}

/**
 * Reads the root `package.json` script names once.
 */
function readRootScriptNames(): ReadonlySet<string> {
  const manifest: unknown = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
  );
  const scripts = asRecord(asRecord(manifest)?.scripts);
  return new Set(Object.keys(scripts ?? {}));
}

const ROOT_SCRIPT_NAMES = readRootScriptNames();

/**
 * Returns `value` as a string-keyed record, or `undefined` when it is not a mapping.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

/**
 * Whether `target` has a pending exemption for `rule`.
 */
function isPending(target: string, rule: PendingRule["rule"]): boolean {
  return PENDING_RULES.some((pending) => pending.target === target && pending.rule === rule);
}

/**
 * Checks that a job runs on the runner its table entry names.
 */
function runnerViolations(key: string, job: JobShape): string[] {
  if (job.uses !== undefined) {
    return [];
  }
  if (ROUTED_JOBS.some((routed) => routed.key === key)) {
    return job["runs-on"] === ROUTED_RUNS_ON
      ? []
      : [`${key}: routed job must run on the BLACKSMITH_RUNNER expression`];
  }
  const literal = LITERAL_JOBS.find((entry) => entry.key === key);
  if (literal === undefined) {
    return [`${key}: job is in neither ROUTED_JOBS nor LITERAL_JOBS`];
  }
  return job["runs-on"] === literal.runner
    ? []
    : [`${key}: literal job must run on ${literal.runner}`];
}

/**
 * Lists a job's steps as records, dropping anything that is not a mapping.
 */
function jobSteps(job: JobShape): Record<string, unknown>[] {
  if (!Array.isArray(job.steps)) {
    return [];
  }
  return job.steps
    .map((step: unknown) => asRecord(step))
    .filter((step): step is Record<string, unknown> => step !== undefined);
}

/**
 * Checks that a job with steps starts with harden-runner.
 */
function hardenViolations(key: string, steps: readonly Record<string, unknown>[]): string[] {
  if (steps.length === 0 || isPending(key, "harden-runner")) {
    return [];
  }
  const firstUses = steps[0]?.uses;
  return typeof firstUses === "string" && firstUses.startsWith(`${HARDEN_RUNNER_ACTION}@`)
    ? []
    : [`${key}: first step must be ${HARDEN_RUNNER_ACTION}`];
}

/**
 * Checks every `run:` line: `bun run` names a root script, and no other package manager is called.
 */
function runViolations(key: string, steps: readonly Record<string, unknown>[]): string[] {
  const lines = steps
    .map((step) => step.run)
    .filter((run): run is string => typeof run === "string")
    .flatMap((run) => run.split("\n").map((line) => line.trim()));
  const missingScripts = lines.flatMap((line) =>
    [...line.matchAll(BUN_RUN_PATTERN)]
      .map((match) => match[1] ?? "")
      .filter((name) => !ROOT_SCRIPT_NAMES.has(name))
      .map((name) => `${key}: "bun run ${name}" names no root package.json script`),
  );
  const otherManagers = lines
    .filter((line) => OTHER_PACKAGE_MANAGER_PATTERN.test(line))
    .map((line) => `${key}: "${line}" calls a package manager other than bun`);
  return [...missingScripts, ...otherManagers];
}

/**
 * Checks that a job in a `deploy*.yml` workflow only runs on `main`.
 */
function mainGuardViolations(file: string, key: string, job: JobShape): string[] {
  if (!file.startsWith("deploy") || isPending(key, "main-guard")) {
    return [];
  }
  return typeof job.if === "string" && job.if.includes(MAIN_GUARD)
    ? []
    : [`${key}: deploy job must be guarded with if: ${MAIN_GUARD}`];
}

/**
 * Lists every rule a parsed workflow breaks, as `file: message` or `file:job: message` lines.
 */
export function workflowViolations(file: string, workflow: unknown): readonly string[] {
  const document = asRecord(workflow);
  const jobs = asRecord(document?.jobs);
  if (document === undefined || jobs === undefined) {
    return [`${file}: has no jobs mapping`];
  }
  const concurrency =
    document.concurrency === undefined && !isPending(file, "concurrency")
      ? [`${file}: declares no concurrency`]
      : [];
  const jobViolations = Object.entries(jobs).flatMap(([name, value]) => {
    const key = `${file}:${name}`;
    const job: JobShape = asRecord(value) ?? {};
    const steps = jobSteps(job);
    return runnerViolations(key, job).concat(
      hardenViolations(key, steps),
      runViolations(key, steps),
      mainGuardViolations(file, key, job),
    );
  });
  return concurrency.concat(jobViolations);
}
