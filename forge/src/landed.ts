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

/**
 * Reads a GitHub issue's state through `gh`: closed as completed is `done`,
 * open or closed as not planned is `open`. Any failure is `unknown`.
 */
async function readGithubIssueState(ticket: string): Promise<TrackerState> {
  const number = /(\d+)$/.exec(ticket)?.[1];
  if (number === undefined) return "unknown";
  const result = await Bun.$`gh issue view ${number} --json state,stateReason`.nothrow().quiet();
  if (result.exitCode !== 0) return "unknown";
  try {
    const parsed: unknown = JSON.parse(result.stdout.toString());
    if (typeof parsed !== "object" || parsed === null) return "unknown";
    const { state, stateReason } = parsed as { state?: unknown; stateReason?: unknown };
    if (state === "OPEN") return "open";
    if (state !== "CLOSED") return "unknown";
    return stateReason === "COMPLETED" ? "done" : "open";
  } catch {
    return "unknown";
  }
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

async function readStateOrUnknown(
  read: (ticket: string) => Promise<TrackerState>,
  ticket: string,
): Promise<TrackerState> {
  try {
    return await read(ticket);
  } catch {
    return "unknown";
  }
}

/**
 * The landed verdict for a ticket's branch. The tracker answers first
 * (`done` is `landed`, `open` is `not-landed`); only an `unknown` answer, or
 * a tracker error, falls back to the branch's content against trunk. A
 * tracker error is never `landed` by itself.
 */
export async function resolveLandedVerdict(
  input: { ticket: string; branch: string },
  context: LandedContext,
): Promise<LandedVerdict> {
  const { config } = context;
  const readState =
    context.readTrackerState ??
    ((ticket: string) => readConfiguredTrackerState(ticket, config.tracker.kind));
  const state = await readStateOrUnknown(readState, input.ticket);
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
