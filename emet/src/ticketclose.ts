interface GhResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

export type CloseReason = "completed" | "not_planned";

export interface TicketCloseOptions {
  readonly pr?: number;
  readonly reason: CloseReason;
}

export interface TicketCloseResult {
  readonly ticket: string;
  readonly issue: number | null;
  readonly outcome: "closed" | "already-closed" | "failed";
  readonly detail?: string;
}

const TICKET_PATTERN = /^(?:CLA-|#)?(\d+)$/;

/**
 * Extracts the GitHub issue number from `CLA-<n>`, `#<n>` or a bare `<n>`.
 * Anything else, or a zero, is `null`.
 */
export function parseIssueNumber(ticket: string): number | null {
  const match = TICKET_PATTERN.exec(ticket.trim());
  if (match === null) return null;
  const issue = Number(match[1]);
  return Number.isSafeInteger(issue) && issue > 0 ? issue : null;
}

/** The real runner: spawns `gh` and captures its output. */
export const runGh: GhRunner = async (args) => {
  const result = await Bun.$`gh ${args}`.nothrow().quiet();
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};

function failureDetail(result: GhResult): string {
  const text = result.stderr.trim() || result.stdout.trim();
  return text.length > 0 ? text : `gh exited ${result.exitCode}`;
}

async function readState(issue: number, gh: GhRunner): Promise<string> {
  const result = await gh(["issue", "view", String(issue), "--json", "state", "--jq", ".state"]);
  if (result.exitCode !== 0) throw new Error(failureDetail(result));
  return result.stdout.trim();
}

async function closeOne(
  ticket: string,
  options: TicketCloseOptions,
  gh: GhRunner,
): Promise<TicketCloseResult> {
  const issue = parseIssueNumber(ticket);
  if (issue === null) {
    return { ticket, issue, outcome: "failed", detail: `"${ticket}" is not a ticket id` };
  }
  try {
    if ((await readState(issue, gh)) === "CLOSED") {
      return { ticket, issue, outcome: "already-closed" };
    }
    const args = [
      "issue",
      "close",
      String(issue),
      "--reason",
      options.reason === "not_planned" ? "not planned" : "completed",
    ];
    if (options.pr !== undefined) args.push("--comment", `Landed in #${options.pr}`);
    const closed = await gh(args);
    if (closed.exitCode !== 0) {
      return { ticket, issue, outcome: "failed", detail: failureDetail(closed) };
    }
    const state = await readState(issue, gh);
    if (state !== "CLOSED") {
      return { ticket, issue, outcome: "failed", detail: `issue is ${state} after close` };
    }
    return { ticket, issue, outcome: "closed" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ticket, issue, outcome: "failed", detail };
  }
}

/**
 * Closes each ticket's GitHub issue, in order, then verifies the state. A
 * ticket already closed reports `already-closed`; one failure never stops the
 * rest. `options.pr` adds the comment "Landed in #<pr>".
 */
export async function closeGithubTickets(
  tickets: readonly string[],
  options: TicketCloseOptions,
  gh: GhRunner,
): Promise<readonly TicketCloseResult[]> {
  const results: TicketCloseResult[] = [];
  for (const ticket of tickets) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: a repeated ticket must see the earlier close
    results.push(await closeOne(ticket, options, gh));
  }
  return results;
}

export interface SpecCloseResult {
  readonly spec: number | null;
  readonly ticket?: number;
  readonly outcome: "closed" | "open" | "already-closed" | "failed";
  readonly detail?: string;
}

interface SpecProgress {
  readonly state: string;
  readonly total: number;
  readonly completed: number;
}

async function readParent(issue: number, gh: GhRunner): Promise<number | null> {
  const result = await gh([
    "issue",
    "view",
    String(issue),
    "--json",
    "parent",
    "--jq",
    ".parent.number",
  ]);
  if (result.exitCode !== 0) throw new Error(failureDetail(result));
  const text = result.stdout.trim();
  return parseIssueNumber(text);
}

async function readSpecProgress(spec: number, gh: GhRunner): Promise<SpecProgress> {
  const result = await gh(["issue", "view", String(spec), "--json", "state,subIssuesSummary"]);
  if (result.exitCode !== 0) throw new Error(failureDetail(result));
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isRecord(parsed) || !isRecord(parsed.subIssuesSummary)) {
    throw new Error("unexpected issue view output");
  }
  const { state } = parsed;
  const { total, completed } = parsed.subIssuesSummary;
  if (typeof state !== "string" || typeof total !== "number" || typeof completed !== "number") {
    throw new Error("unexpected issue view output");
  }
  return { state, total, completed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function closeSpec(spec: number, gh: GhRunner): Promise<SpecCloseResult> {
  try {
    const progress = await readSpecProgress(spec, gh);
    if (progress.state === "CLOSED") return { spec, outcome: "already-closed" };
    if (progress.total <= 0 || progress.completed !== progress.total) {
      return { spec, outcome: "open" };
    }
    const closed = await gh([
      "issue",
      "close",
      String(spec),
      "--reason",
      "completed",
      "--comment",
      `All ${progress.total} tickets landed.`,
    ]);
    if (closed.exitCode !== 0) {
      return { spec, outcome: "failed", detail: failureDetail(closed) };
    }
    const state = await readState(spec, gh);
    if (state !== "CLOSED") {
      return { spec, outcome: "failed", detail: `issue is ${state} after close` };
    }
    return { spec, outcome: "closed" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { spec, outcome: "failed", detail };
  }
}

/**
 * Closes the parent spec of every ticket that ended `closed` or
 * `already-closed`, once per distinct parent, when all its sub-issues are
 * completed. A ticket without a parent adds no entry; a failed parent read
 * reports `failed` with `spec: null` and the ticket's own issue number in
 * `ticket`, because the parent is unknown.
 */
export async function closeCompletedSpecs(
  results: readonly TicketCloseResult[],
  gh: GhRunner,
): Promise<readonly SpecCloseResult[]> {
  const specs: SpecCloseResult[] = [];
  const seen = new Set<number>();
  for (const result of results) {
    if (result.issue === null) continue;
    if (result.outcome !== "closed" && result.outcome !== "already-closed") continue;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: the same parent must be read once
      const parent = await readParent(result.issue, gh);
      if (parent === null || seen.has(parent)) continue;
      seen.add(parent);
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose
      specs.push(await closeSpec(parent, gh));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      specs.push({
        spec: null,
        ticket: result.issue,
        outcome: "failed",
        detail: `parent read failed: ${detail}`,
      });
    }
  }
  return specs;
}
