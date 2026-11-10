import type { ForgeConfig } from "./config";
import { listTickets, parseTicketId, resolveTrackerRoot } from "./tracker-files";
import { classifyByContent, resolveMainTree } from "./worktrees";

export type LandedVerdict = "landed" | "not-landed" | "unknown";

type TrackerState = "done" | "open" | "unknown";

export interface LandedContext {
  readonly config: ForgeConfig;
  readonly readTrackerState?: (ticket: string) => Promise<TrackerState>;
  readonly classifyContent?: typeof classifyByContent;
}

export type GithubIssueRunner = (
  issueNumber: string,
) => Promise<{ readonly exitCode: number; readonly stdout: string }>;

const runGithubIssueView: GithubIssueRunner = async (issueNumber) => {
  const result = await Bun.$`gh issue view ${issueNumber} --json state,stateReason`
    .nothrow()
    .quiet();
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
};

/**
 * Maps `gh issue view --json state,stateReason` output to a tracker state:
 * closed as completed is `done`, open or closed as not planned is `open`.
 * Output it cannot interpret throws, because a failed read must never look
 * like the tracker's own "unknown" answer.
 */
export function parseGithubIssueState(stdout: string): TrackerState {
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("landed: unexpected gh issue view output");
  }
  const { state, stateReason } = parsed as { state?: unknown; stateReason?: unknown };
  if (state === "OPEN") return "open";
  if (state === "CLOSED") return stateReason === "COMPLETED" ? "done" : "open";
  throw new Error(`landed: unexpected issue state ${JSON.stringify(state)}`);
}

/**
 * Reads a GitHub issue's state through `gh`. A ticket id with no issue number
 * is `unknown`; a `gh` failure (offline, rate limit, auth) or unreadable
 * output rejects, so the caller can tell an error apart from "unknown".
 */
export async function readGithubIssueState(
  ticket: string,
  run: GithubIssueRunner = runGithubIssueView,
): Promise<TrackerState> {
  const issueNumber = /(\d+)$/.exec(ticket)?.[1];
  if (issueNumber === undefined) return "unknown";
  const result = await run(issueNumber);
  if (result.exitCode !== 0) {
    throw new Error(`landed: gh issue view ${issueNumber} failed with exit ${result.exitCode}`);
  }
  return parseGithubIssueState(result.stdout);
}

/** Reads a local tracker ticket's `Status:`: `done` is `done`, any other status is `open`. */
async function readLocalTicketState(ticket: string): Promise<TrackerState> {
  const parsed = parseTicketId(ticket);
  if (parsed === null) return "unknown";
  const root = await resolveTrackerRoot();
  const tickets = await listTickets(root, parsed.slug);
  const match = tickets.find((candidate) => candidate.nn === parsed.nn);
  if (match === undefined || match.status === null) return "unknown";
  return match.status === "done" ? "done" : "open";
}

async function readConfiguredTrackerState(
  ticket: string,
  kind: ForgeConfig["tracker"]["kind"],
): Promise<TrackerState> {
  if (kind === "github") return readGithubIssueState(ticket);
  if (kind === "local") return readLocalTicketState(ticket);
  return "unknown";
}

/**
 * The landed verdict for a ticket's branch. The tracker answers first
 * (`done` is `landed`, `open` is `not-landed`); only an `unknown` answer
 * falls back to the branch's content against trunk. A tracker read that
 * rejects is `unknown` and skips git too: an empty or already-merged worker
 * branch would otherwise look landed while the ticket is still open.
 */
export async function resolveLandedVerdict(
  input: { ticket: string; branch: string },
  context: LandedContext,
): Promise<LandedVerdict> {
  const { config } = context;
  const readState =
    context.readTrackerState ??
    ((ticket: string) => readConfiguredTrackerState(ticket, config.tracker.kind));
  let state: TrackerState;
  try {
    state = await readState(input.ticket);
  } catch {
    return "unknown";
  }
  if (state === "done") return "landed";
  if (state === "open") return "not-landed";

  const classify = context.classifyContent ?? classifyByContent;
  const { remote, trunk } = config.repo;
  const local = config.landing.mode === "merge";
  try {
    const mainTree = await resolveMainTree(remote, trunk, { local });
    const verdict = await classify(input.branch, mainTree, remote, trunk, { local });
    return verdict === "merged" || verdict === "equivalent" ? "landed" : "not-landed";
  } catch {
    return "unknown";
  }
}

export interface UnownedReclaimInput {
  /** The ticket its worker-shaped branch names, or `null` when the branch is not worker-shaped. */
  readonly workerTicket: string | null;
  readonly landed: LandedVerdict;
  readonly clean: boolean;
  /** A lock reason that is not emet's: some other tool or a human holds the worktree. */
  readonly lockedByOther: boolean;
}

export interface UnownedReclaimVerdict {
  readonly reclaimable: boolean;
  /** The first failing condition, or why it is reclaimable; printed by both preflight and cleanup. */
  readonly reason: string;
}

/**
 * The one rule for an Unowned worktree, shared by `emet preflight`'s advice
 * and `emet cleanup`'s removal: reclaimable only when no other tool locks it,
 * its branch is worker-shaped, its ticket landed and its tree is clean. The
 * reason names the first failing condition, checked in that order.
 */
export function unownedReclaimVerdict(input: UnownedReclaimInput): UnownedReclaimVerdict {
  if (input.lockedByOther) return { reclaimable: false, reason: "locked by another tool" };
  if (input.workerTicket === null) {
    return { reclaimable: false, reason: "branch is not worker-shaped" };
  }
  if (input.landed === "not-landed") return { reclaimable: false, reason: "ticket not landed" };
  if (input.landed === "unknown") {
    return { reclaimable: false, reason: "ticket landed state unknown" };
  }
  if (!input.clean) return { reclaimable: false, reason: "dirty tree" };
  return { reclaimable: true, reason: "ticket landed and tree clean" };
}
