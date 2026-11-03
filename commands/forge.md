---
description: One-shot feature pipeline — interview, spec, tickets, one OK, then parallel worktree agents implement, test, and merge unattended
---

FEATURE: $ARGUMENTS

## Modes

Parse `$ARGUMENTS` for a leading `--draft` or `--dispatch <spec-id>` flag
before anything else:

- **No flag** (default): Phases 1–5 plus the first wave in this session; each
  later wave runs in its own session — `/forge --dispatch <spec-id>` by hand,
  or auto-launched when `handoff.autoChain` is on (see Phase 9 in
  `reference/phases-9-handoff.md`).
  To run a wave in another session, always use `forge launch <spec-id> --wave
  <n>` — never a bare `claude --bg`.
- **`--draft <feature>`**: run Phases 0–5 and then stop (see the note at the
  end of Phase 5). Nothing gets dispatched; the run ends with a spec issue
  and its tickets sitting in the tracker, ready for `--dispatch` later, in
  this session or a fresh one.
- **`--dispatch <spec-id>`**: run Phase 0 (the repo gate), then skip straight
  to Phase 6 using `<spec-id>` as the frontier's parent. `<spec-id>` must
  already be a spec issue with tickets in the tracker's initial dispatch-
  eligible state (see `docs/agents/issue-tracker.md`) — created by a prior
  `--draft` run, in this session or another. This mode also resumes a run
  interrupted mid-wave: the frontier recomputes from the tracker's live
  state, so tickets already done don't re-dispatch.

## 0. Repo gate

Detect the repo root (`git rev-parse --show-toplevel`; if that fails, stop —
`/forge` needs a git repo). Read `forge.config.json` at that root.

**If it doesn't exist**, `/forge` has no safe default for this repo's
tracker, ticket shape, or worktree/concurrency settings — offer to run
`forge init` (autodetects package manager, trunk, and tracker kind; writes
`forge.config.json` plus `docs/agents/{forge,issue-tracker,triage-labels,
domain}.md`, leaving `TODO(forge):` markers for anything it can't infer),
then grill the user for whatever markers remain before continuing. Don't
dispatch against a repo `forge preflight` would reject.

If it exists, read it plus `docs/agents/{forge,issue-tracker,triage-labels,
domain}.md` at the root. Everything below defers to what those four files
(and `forge.config.json`) say for *this* repo over the generic defaults
described here — this includes the literal tracker calls
(`docs/agents/issue-tracker.md`), which of `onStart`/`onPrOpen`/`onPrMerge`
this coordinator itself must write (`tracker.transitions` — see
`~/.claude/forge/reference/tracker-<kind>.md`, `<kind>` from
`forge.config.json`'s `tracker.kind`), and the branch/commit convention
(`ticket.branchPrefix`/`commit.trailer`).

`local`-tracker repos: ticket creation and state writes need `forge tracker`
operations not yet implemented — until then, don't run Phases 5–9 unattended
against a `local`-tracker repo; a human creates/updates tickets by hand
following `docs/agents/issue-tracker.md`'s file format.

`/forge` is designed to run inside plan mode (Phases 1–4 do no writes; the
plan's approval — `ExitPlanMode` — is the one freeze point). The harness
signals plan mode with a system reminder. In the default and `--draft` modes,
if that reminder is absent, load the tool with
`ToolSearch("select:EnterPlanMode")` and call `EnterPlanMode` before Phase 1;
the user confirms the switch. If `EnterPlanMode` can't be loaded or the user
declines, tell the user and continue anyway, keeping Phases 1–4 write-free.

This only applies to the default and `--draft` modes. `--dispatch` skips
straight to Phase 6 — there's no Phases 1–4 write-free zone to protect, and
no `ExitPlanMode` call. If the user happens to invoke it from inside plan
mode anyway, Phase 6 onward's real writes (tracker, worktrees, commits) will
simply get blocked by plan mode itself — nothing extra to detect.

All interaction with the user happens once, in Phase 4 (the plan approval).
After that, nothing here asks another question — flag what needs a human and
keep going; report everything at the end.

## Phase index

Load only what the current mode needs — never both reference files at once
unless the run continues from Phase 5 straight into Phase 6.

- **Phases 1–5** (default and `--draft` only): interview → spec → tickets →
  the one approval → materialize. Read
  `~/.claude/forge/reference/phases-1-5.md` when you reach Phase 1.
- **What a "wave" is**: Phases 6–8 are the body of a loop, not three
  one-shot steps. **One wave = one dependency layer** — the set of tickets
  simultaneously unblocked, dispatched together, implemented in parallel,
  then merged and shipped as their own PR before the next layer's tickets
  (now unblocked in turn) get computed and dispatched. A spec with 4
  dependency layers produces 4 waves, 4 integration branches, 4 PRs — never
  one PR for the whole run. This is load-bearing: it keeps each PR reviewable
  and lets a repo's E2E singleton (if any) run serialized, once per wave.
  Lifecycle of one wave:
  1. Dispatch the unblocked tickets; workers implement in worktrees.
  2. Integration plus review on the wave's integration branch.
  3. One PR, with a `Closes` line per ticket.
  4. Merged when `pr.autoMerge` is on and checks pass (CI fixes up to
     `pr.maxCiFixAttempts`); left open when autoMerge is off, anything was
     flagged, or CI fixes ran out.
  5. If merged, `forge cleanup --run <runId>`. Then the Phase 9 hand-off: if
     more tickets can run, the next wave starts in a new session; if none can,
     the run ends with the final report. Details in `reference/phases-9-handoff.md`.
- **Phases 6–9** (every mode): dispatch → per-worker implementation → wave
  close-out → wave close and hand off. Read
  `~/.claude/forge/reference/phases-6-7-dispatch.md` when you reach Phase 6
  (Phase 8 lives in `phases-8-closeout.md`, Phase 9 in `phases-9-handoff.md`;
  load each when you reach it, and re-read Phase 8 before every fix/review
  round), along with `~/.claude/forge/reference/worker-prompt.md` (the dispatch prompt
  template) and `~/.claude/forge/reference/tracker-<kind>.md` (`<kind>` from
  `forge.config.json`'s `tracker.kind`) for this repo's literal tracker
  calls. Workers dispatch as `subagent_type: "forge-worker"`; Phase 8's
  review dispatches as `subagent_type: "forge-reviewer"` from
  `~/.claude/forge/reference/reviewer-prompt.md`'s template — both agent
  definitions pin their own model and effort (see the README's "Models &
  effort" section) and are installed by `install.sh`.
- **`reference/incidents.md`** — the evidence behind the five non-negotiables
  below (real run failures, with what broke and how). Never loaded during a
  normal run; read it only when someone asks why a rule exists.

## Five non-negotiables

These apply in every mode, can't be paraphrased away by a reference file,
and are restated here so they're never missed even by a run that only ever
loads `phases-6-7-dispatch.md`:

1. Never dispatch a ticket without both `forge claims --reserve` and
   `forge slots --acquire` succeeding for it first.
2. Never call either through an inline snippet (e.g. `bun -e`) — always the
   `forge` CLI, exactly as documented in `reference/phases-6-7-dispatch.md`.
3. A worker never dispatches agents of its own — no `Agent` calls, no forks.
4. The coordinator is the single tracker writer: workers never write it. It
   writes a transition only where `tracker.transitions` names it
   `coordinator` or `worker` (`onStart`, written by the coordinator at
   dispatch) for that trigger — never where it's `automatic`.
5. Always report — success, failure, or blocked — never end a wave or a
   session silently.
