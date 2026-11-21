/**
 * `emet spec-branch abandon --spec <id> --force`: gives up a spec branch.
 * It tags the tip `abandoned/spec-<id>`, deletes `spec/<id>`, journals
 * `spec.abandon` and returns the integrated tickets to `ready-for-agent`:
 * written for a local tracker, printed for GitHub and Linear so the
 * coordinator can do it.
 */

import { exitCodes } from "./exit-codes";
import { appendEvent } from "./journal";
import { errorMessage } from "./narrow";
import { readSpecBranchState, specBranchName, type SpecBranchContext } from "./specbranch";
import { mutateStatus } from "./tracker";

const READY_STATUS = "ready-for-agent";

/** The tag that keeps an abandoned spec branch reachable: `abandoned/spec-<id>`. */
export function abandonedTagName(spec: string): string {
  return `abandoned/spec-${spec}`;
}

async function git(cwd: string, ...args: string[]): Promise<{ exitCode: number; stderr: string }> {
  const result = await Bun.$`git -C ${cwd} ${args}`.nothrow().quiet();
  return { exitCode: result.exitCode, stderr: result.stderr.toString().trim() };
}

async function resetLocalTickets(
  root: string,
  tickets: readonly string[],
): Promise<{ reset: string[]; failed: string[] }> {
  const reset: string[] = [];
  const failed: string[] = [];
  for (const ticket of tickets) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each write locks its spec
      await mutateStatus(root, ticket, READY_STATUS, true);
      reset.push(ticket);
    } catch (error: unknown) {
      failed.push(`${ticket} (${errorMessage(error)})`);
    }
  }
  return { reset, failed };
}

/** `emet spec-branch abandon`: refuses without `--force`; changes nothing when it refuses. */
export async function runAbandon(argv: string[], context: SpecBranchContext): Promise<number> {
  const { root, spec, config } = context;
  const branch = specBranchName(spec);
  if (!argv.includes("--force")) {
    console.error(`emet spec-branch abandon: refusing to abandon ${branch} without --force`);
    return exitCodes.findings;
  }
  const state = await readSpecBranchState(root, spec);
  if (state === null) {
    console.error(`emet spec-branch abandon: branch ${branch} does not exist`);
    return exitCodes.findings;
  }
  const tag = abandonedTagName(spec);
  const tagged = await git(root, "-c", "tag.gpgSign=false", "tag", tag, state.tip);
  if (tagged.exitCode !== 0) {
    console.error(`emet spec-branch abandon: git tag ${tag} failed: ${tagged.stderr}`);
    return exitCodes.findings;
  }
  const deleted = await git(root, "branch", "--delete", "--force", branch);
  if (deleted.exitCode !== 0) {
    await git(root, "tag", "--delete", tag);
    console.error(`emet spec-branch abandon: deleting ${branch} failed: ${deleted.stderr}`);
    return exitCodes.findings;
  }

  const tickets = state.waves.flatMap((wave) => wave.tickets);
  const local = config.tracker.kind === "local";
  const outcome = local
    ? await resetLocalTickets(root, tickets)
    : { reset: [] as string[], failed: [] as string[] };
  appendEvent({
    kind: "spec.abandon",
    repo: root,
    origin: "human",
    data: { spec, tag, tip: state.tip, tickets, reset: outcome.reset },
  });
  console.log(
    JSON.stringify({
      spec,
      tag,
      tip: state.tip,
      tickets,
      reset: outcome.reset,
      ...(local ? {} : { forCoordinator: tickets }),
      ...(outcome.failed.length > 0 ? { failed: outcome.failed } : {}),
    }),
  );
  return outcome.failed.length > 0 ? exitCodes.findings : exitCodes.success;
}
