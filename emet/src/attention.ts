/**
 * The **Attention state** of an emet-owned session, recorded by `emet guard`
 * as the journal kind `session.attention` on each change (ADR-0042). An event
 * holds the session id, the previous and new state, the trigger and the run
 * id; never anything else from the hook input.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import type { AgentHostName } from "./agenthost";
import { alertNeedsDecision } from "./attention-alert";
import { isValidSessionId, resolveWorktreeEventOwner, runHasUnfinishedTicket } from "./guard";
import { detectAgentHost } from "./guard-codex";
import {
  appendEvent,
  readJournalSegments,
  readRecentEvents,
  type JournalDeps,
  type JournalEvent,
} from "./journal";
import { BINARY } from "./names";
import { isObject, isOneOf } from "./narrow";
import { readPhase } from "./phase";
import { parseWorktreeEntries } from "./worktrees";

const ATTENTION_STATES = ["working", "needs-decision", "idle", "ended"] as const;

/** Whether a session is working, needs a decision, is idle or has ended. */
export type AttentionState = (typeof ATTENTION_STATES)[number];

/** The hook event that caused a transition. */
export type AttentionTrigger =
  | "PermissionRequest"
  | "Notification"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "Stop"
  | "SessionEnd";

const DECISION_NOTIFICATIONS: ReadonlySet<string> = new Set([
  "permission_prompt",
  "elicitation_dialog",
  "elicitation_url_dialog",
  "agent_needs_input",
]);

const TAIL_BYTES = 1024 * 1024;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONFIG_FILE = "emet.config.json";
const FINISHED_PHASES: ReadonlySet<string> = new Set(["done", "failed"]);

/** Where a session belongs: the main worktree root and the run, when known. */
export interface AttentionOwner {
  readonly repo: string;
  readonly runId: string | null;
}

/** Test seams; every field defaults to the real thing. */
export interface AttentionDeps {
  readonly journal?: JournalDeps;
  readonly host?: AgentHostName;
  readonly resolveOwner?: (cwd: string) => Promise<AttentionOwner | null>;
  readonly runBlocked?: (runId: string | null, cwd: string) => Promise<boolean>;
  readonly alert?: (transition: AttentionTransition) => Promise<unknown>;
}

/** One recorded change of a session's attention state. */
export interface AttentionTransition {
  sessionId: string;
  repo: string;
  runId: string | null;
  from: AttentionState | null;
  to: AttentionState;
  trigger: AttentionTrigger;
}

/** The latest attention state of one session. */
export interface SessionAttention {
  sessionId: string;
  repo: string;
  runId: string | null;
  state: AttentionState;
  blocked: boolean;
  since: string;
}

/**
 * The state a trigger leads to, or `null` for no change. A codex `Stop` needs a
 * decision when the run has a `BLOCKED` or `NEEDS_CONTEXT` result.
 */
export function attentionStateFor(
  trigger: AttentionTrigger,
  facts: { notificationType?: string; host: AgentHostName; runBlocked: boolean },
): AttentionState | null {
  if (trigger === "PermissionRequest") return "needs-decision";
  if (trigger === "Notification") {
    if (facts.notificationType === "idle_prompt") return "idle";
    return facts.notificationType !== undefined &&
      DECISION_NOTIFICATIONS.has(facts.notificationType)
      ? "needs-decision"
      : null;
  }
  if (trigger === "Stop") {
    return facts.host === "codex" && facts.runBlocked ? "needs-decision" : "idle";
  }
  if (trigger === "SessionEnd") return "ended";
  return "working";
}

function attentionData(
  event: JournalEvent,
): { sessionId: string; state: AttentionState } | undefined {
  if (event.kind !== "session.attention") return undefined;
  const { sessionId, state } = event.data;
  if (typeof sessionId !== "string" || !isOneOf(ATTENTION_STATES, state)) return undefined;
  return { sessionId, state };
}

/**
 * The session's last recorded state, from at most the last 1 MiB of the
 * current journal file; `null` when none is found there.
 */
export function lastAttentionState(sessionId: string, deps?: JournalDeps): AttentionState | null {
  const needle = `"sessionId":${JSON.stringify(sessionId)}`;
  for (const event of readRecentEvents(TAIL_BYTES, (line) => line.includes(needle), deps)) {
    const data = attentionData(event);
    if (data?.sessionId === sessionId) return data.state;
  }
  return null;
}

/** The main worktree root of the checkout at `cwd`, or `null` outside a git repo. */
export async function mainWorktreeRoot(cwd: string): Promise<string | null> {
  const result = await Bun.$`git -C ${cwd} worktree list --porcelain`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  return parseWorktreeEntries(result.stdout.toString())[0]?.directory ?? null;
}

/**
 * The owner of a session in `cwd`: an emet worker worktree, or a repo with an
 * emet config and a run whose phase is not `done` or `failed`. `repo` is
 * always the main worktree root.
 */
export async function resolveAttentionOwner(cwd: string): Promise<AttentionOwner | null> {
  const repo = await mainWorktreeRoot(cwd);
  if (repo === null) return null;
  const worker = await resolveWorktreeEventOwner(cwd);
  if (worker) return { repo, runId: worker.runId };
  if (!existsSync(path.join(repo, CONFIG_FILE))) return null;
  const phase = readPhase(repo);
  if (phase === null || FINISHED_PHASES.has(phase.phase)) return null;
  return { repo, runId: phase.runId };
}

function hookString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

async function transitionFor(
  trigger: AttentionTrigger,
  input: unknown,
  deps: AttentionDeps,
): Promise<AttentionTransition | null> {
  if (!isObject(input) || Array.isArray(input)) return null;
  const sessionId = input.session_id;
  const cwd = hookString(input, "cwd");
  if (!isValidSessionId(sessionId) || cwd === undefined || cwd === "") return null;
  const host = deps.host ?? detectAgentHost();
  const notificationType = hookString(input, "notification_type");
  const facts = { host, ...(notificationType === undefined ? {} : { notificationType }) };
  const dependsOnRun = trigger === "Stop" && host === "codex";

  const provisional = attentionStateFor(trigger, { ...facts, runBlocked: false });
  if (provisional === null) return null;
  const from = lastAttentionState(sessionId, deps.journal);
  if (!dependsOnRun && from === provisional) return null;

  const owner = await (deps.resolveOwner ?? resolveAttentionOwner)(cwd);
  if (owner === null) return null;
  const runBlocked =
    dependsOnRun &&
    (await (deps.runBlocked ?? ((runId, directory) => runHasUnfinishedTicket(runId, directory)))(
      owner.runId,
      cwd,
    ));
  const to = attentionStateFor(trigger, { ...facts, runBlocked }) ?? provisional;
  if (to === from) return null;
  return { sessionId, repo: owner.repo, runId: owner.runId, from, to, trigger };
}

/**
 * Appends a `session.attention` event when the hook moves an emet-owned
 * session into a new state, and returns that transition. Never throws: a
 * failure is reported on one stderr line and records nothing.
 */
export async function recordAttention(
  trigger: AttentionTrigger,
  input: unknown,
  deps: AttentionDeps = {},
): Promise<AttentionTransition | null> {
  try {
    const transition = await transitionFor(trigger, input, deps);
    if (transition === null) return null;
    appendEvent(
      {
        kind: "session.attention",
        ...(transition.runId === null ? {} : { runId: transition.runId }),
        repo: transition.repo,
        origin: "auto",
        data: {
          sessionId: transition.sessionId,
          state: transition.to,
          from: transition.from,
          trigger,
        },
      },
      deps.journal,
    );
    if (transition.to === "needs-decision" && transition.from !== "needs-decision") {
      await (deps.alert ?? ((entered) => alertNeedsDecision(entered)))(transition);
    }
    return transition;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `${BINARY}:guard — could not record the attention state: ${message.split("\n")[0] ?? ""}`,
    );
    return null;
  }
}

/**
 * The latest state of each session within the window (default 24 hours),
 * optionally for one repo, newest first; sessions that ended are left out.
 */
export function readSessionAttention(
  options: { repo?: string; now?: Date; windowMs?: number },
  deps?: JournalDeps,
): SessionAttention[] {
  const now = (options.now ?? new Date()).getTime();
  const oldest = now - (options.windowMs ?? DEFAULT_WINDOW_MS);
  const latest = new Map<string, SessionAttention>();
  for (const event of readJournalSegments(deps).events) {
    const data = attentionData(event);
    if (data === undefined) continue;
    if (options.repo !== undefined && event.repo !== options.repo) continue;
    if (Date.parse(event.ts) < oldest) continue;
    latest.set(data.sessionId, {
      sessionId: data.sessionId,
      repo: event.repo,
      runId: event.runId ?? null,
      state: data.state,
      blocked: data.state === "needs-decision",
      since: event.ts,
    });
  }
  return [...latest.values()]
    .filter((session) => session.state !== "ended")
    .toSorted((left, right) => right.since.localeCompare(left.since));
}
