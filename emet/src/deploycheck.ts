/** `emet deploy-check`: runs the configured post-deploy check until it passes. */

import { loadForgeConfigWithDefaults, resolveRepoRoot, type ForgeConfig } from "./config";
import { exitCodes } from "./exit-codes";

type DeployCheckConfig = NonNullable<NonNullable<ForgeConfig["deploy"]>["check"]>;

/** How a deploy check ended. */
export type DeployCheckState = "ok" | "failed" | "timeout";

/** The outcome of {@link runDeployCheck}. */
export interface DeployCheckResult {
  readonly state: DeployCheckState;
  readonly attempts: number;
}

/** The side effects the check loop needs, injectable for tests. */
export interface DeployCheckDeps {
  readonly run: (command: string) => Promise<number>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
}

const TIMEOUT_EXIT_CODE = 3;

/**
 * Runs `check.command` until it exits 0. Stops with `failed` after
 * `check.retries` attempts, or with `timeout` once `check.timeoutSeconds`
 * have elapsed since the first attempt and the command still fails.
 */
export async function runDeployCheck(
  check: DeployCheckConfig,
  deps: DeployCheckDeps,
): Promise<DeployCheckResult> {
  const startedAt = deps.now();
  const attempt = async (attempts: number): Promise<DeployCheckResult> => {
    const exitCode = await deps.run(check.command);
    if (exitCode === 0) return { state: "ok", attempts };
    if (attempts >= check.retries) return { state: "failed", attempts };
    if (deps.now() - startedAt >= check.timeoutSeconds * 1000) {
      return { state: "timeout", attempts };
    }
    await deps.sleep(check.intervalSeconds * 1000);
    return attempt(attempts + 1);
  };
  return attempt(1);
}

function runShellCommand(command: string): Promise<number> {
  const child = Bun.spawn(["sh", "-c", command], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  });
  return child.exited;
}

const realDeps: DeployCheckDeps = {
  run: runShellCommand,
  sleep: async (milliseconds) => {
    await Bun.sleep(milliseconds);
  },
  now: () => Date.now(),
};

function exitCodeFor(state: DeployCheckState): number {
  if (state === "ok") return exitCodes.success;
  return state === "failed" ? exitCodes.findings : TIMEOUT_EXIT_CODE;
}

function printResult(result: DeployCheckResult | { skipped: string }, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  if ("skipped" in result) {
    console.log(`skipped: ${JSON.stringify(result.skipped)}`);
    return;
  }
  console.log(`state: ${JSON.stringify(result.state)} (attempts: ${result.attempts})`);
}

/**
 * Entry point for `emet deploy-check`. Absent `deploy.check` exits 0 with a
 * skipped note; otherwise exits 0 ok, 1 failed, 3 timeout.
 */
export async function run(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  try {
    const repoRoot = await resolveRepoRoot();
    if (repoRoot === null) {
      printResult({ skipped: "no deploy check configured" }, json);
      return;
    }
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const check = config.deploy?.check;
    if (check === undefined) {
      printResult({ skipped: "no deploy check configured" }, json);
      return;
    }
    const result = await runDeployCheck(check, realDeps);
    printResult(result, json);
    process.exitCode = exitCodeFor(result.state);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = exitCodes.usage;
  }
}
