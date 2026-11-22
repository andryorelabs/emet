/**
 * The alert raised when a session enters `needs-decision` (ADR-0042): an Orca
 * unread mark on the repo's worktree when the Orca runtime is reachable,
 * otherwise a desktop notification, otherwise nothing. Never throws.
 */

import path from "node:path";

import type { CommandResult, CommandRunner } from "./agenthost";
import type { AttentionTransition } from "./attention";
import { loadForgeConfigWithDefaults } from "./config";
import { errorMessage, isObject } from "./narrow";

const ALERT_TIMEOUT_MS = 3000;
const ALERT_COMMENT = "emet: a session needs a decision";

/** How the alert went out; `disabled` means `attention.alert` is `false`. */
export type AlertOutcome = "orca" | "notify-send" | "none" | "disabled";

/** Test seams; every field defaults to the real thing. */
export interface AlertDeps {
  readonly runner?: CommandRunner;
  readonly alertEnabled?: (repo: string) => Promise<boolean>;
  readonly hasNotifySend?: () => boolean;
}

export const timedRunner: CommandRunner = async (command) => {
  try {
    const child = Bun.spawn([...command], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: ALERT_TIMEOUT_MS,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr } satisfies CommandResult;
  } catch (error: unknown) {
    return { exitCode: 127, stdout: "", stderr: errorMessage(error) };
  }
};

async function configAllowsAlert(repo: string): Promise<boolean> {
  try {
    return (await loadForgeConfigWithDefaults(repo)).config.attention?.alert ?? true;
  } catch {
    return true;
  }
}

async function orcaReachable(runner: CommandRunner): Promise<boolean> {
  const status = await runner(["orca", "status", "--json"]);
  if (status.exitCode !== 0) return false;
  try {
    const parsed: unknown = JSON.parse(status.stdout);
    const result = isObject(parsed) ? parsed.result : undefined;
    const runtime = isObject(result) ? result.runtime : undefined;
    return isObject(runtime) && runtime.reachable === true;
  } catch {
    return false;
  }
}

/**
 * Raises one alert for a transition into `needs-decision`: `orca worktree set
 * --unread` when Orca is reachable, else `notify-send` when it is on PATH,
 * else nothing. Each external call has a 3 s timeout and a failure resolves to
 * `none`; leaving `needs-decision` never clears the Orca mark.
 */
export async function alertNeedsDecision(
  transition: AttentionTransition,
  deps: AlertDeps = {},
): Promise<AlertOutcome> {
  try {
    const enabled = await (deps.alertEnabled ?? configAllowsAlert)(transition.repo);
    if (!enabled) return "disabled";
    const runner = deps.runner ?? timedRunner;
    if (await orcaReachable(runner)) {
      const result = await runner([
        "orca",
        "worktree",
        "set",
        "--worktree",
        `path:${transition.repo}`,
        "--comment",
        ALERT_COMMENT,
        "--unread",
      ]);
      return result.exitCode === 0 ? "orca" : "none";
    }
    if (!(deps.hasNotifySend ?? (() => Bun.which("notify-send") !== null))()) return "none";
    const result = await runner([
      "notify-send",
      "emet",
      `${path.basename(transition.repo)}: a session needs a decision`,
    ]);
    return result.exitCode === 0 ? "notify-send" : "none";
  } catch {
    return "none";
  }
}
