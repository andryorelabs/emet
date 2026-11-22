---
description: One-shot feature pipeline — interview, spec, tickets, one OK, then parallel worktree agents implement, test, and merge unattended
---

FEATURE: $ARGUMENTS

## Modes

Parse `$ARGUMENTS` for a leading `--draft`, `--dispatch <spec-id>` or `--quick`
flag and for `--no-promote` before anything else. When `$ARGUMENTS` carries
`--no-promote` (anywhere among the leading flags, e.g. also `--dispatch <id>
--no-promote`), remove it from FEATURE and, once the spec id exists (end of
Phase 5, or at the start of `--dispatch`), run `emet promote --spec <spec-id>
--hold`. A session without `--no-promote` never holds the spec:

- **No flag** (default): Phases 1–5 plus the first wave in this session; each
  later wave runs in its own session — `/emet:run --dispatch <spec-id>` by hand,
  or auto-launched when `handoff.autoChain` is on (see Phase 9 in
  `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-9-handoff.md`).
  To run a wave in another session, always use `emet launch <spec-id> --wave
  <n>` — never a bare `claude --bg`.
- **`--quick <feature>`**: a Quick run, one folded ticket and one landing. Read
  `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-quick.md` instead of Phases 1–5;
  rejected with `--draft` or `--dispatch`.
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
`/emet:run` needs a git repo). Read `emet.config.json` at that root.

**If it doesn't exist**, `/emet:run` has no safe default for this repo's
tracker, ticket shape, or worktree/concurrency settings — offer to run
`emet init` (autodetects package manager, trunk, and tracker kind; writes
`emet.config.json` plus `docs/agents/{emet,issue-tracker,triage-labels,
domain}.md`, leaving `TODO(emet):` markers for anything it can't infer),
then grill the user for whatever markers remain before continuing. Don't
dispatch against a repo `emet preflight` would reject.

If it exists, read it plus `docs/agents/{emet,issue-tracker,triage-labels,
domain}.md` at the root. Everything below defers to what those four files
(and `emet.config.json`) say for _this_ repo over the generic defaults
described here — this includes the literal tracker calls
(`docs/agents/issue-tracker.md`), which of `onStart`/`onPrOpen`/`onPrMerge`
this coordinator itself must write (`tracker.transitions` — see
`${CLAUDE_PLUGIN_ROOT}/emet/reference/tracker-<kind>.md`, `<kind>` from
`emet.config.json`'s `tracker.kind`), and the branch/commit convention
(`ticket.branchPrefix`/`commit.trailer`).

`local`-tracker repos: tickets live under the main worktree's `.scratch/` and
every op is a literal `emet tracker` call (see the `tracker-local.md`
reference). With `landing.mode: merge` a wave lands as a local merge, not a PR.

`/emet:run` is designed to run inside plan mode (Phases 1–4 do no writes; the
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
  `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-1-5.md` when you reach Phase 1.
- **What a "wave" is**: Phases 6–8 are the body of a loop, not three
  one-shot steps. **One wave = one dependency layer** — the set of tickets
  simultaneously unblocked, dispatched together, implemented in parallel,
  then integrated before the next layer's tickets (now unblocked in turn) get
  computed and dispatched. With `landing.unit: wave` each wave also lands alone
  (one PR, or one local merge when `landing.mode` is `merge`): 4 layers, 4
  integration branches, 4 landings. With `landing.unit: spec` (default) each
  wave merges into `spec/<id>` (`emet spec-branch`) and the spec lands once;
  read `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-8-spec-landing.md`. Either way a wave's
  review stays its own and a repo's E2E singleton (if any) runs once per wave.
  Lifecycle of one wave:
  1. Dispatch the unblocked tickets; workers implement in worktrees.
  2. Integration plus review on the wave's integration branch.
  3. One PR with one `Closes #<n>` line per ticket, or in merge mode one local
     merge; in spec mode `emet spec-branch integrate`, no PR until the final wave.
  4. Merged when `pr.autoMerge` is on and checks pass (`emet ci` waits for
     them; CI fixes up to `pr.maxCiFixAttempts`; in merge mode
     `commands.selfCheck` stands in for CI); open findings hold for up to
     `budgets.fixRounds` fix rounds (`gate.onHold`); left open when autoMerge
     is off, anything was flagged, or fix rounds or CI fixes ran out.
  5. If merged, `emet tracker close` for the wave's tickets (GitHub tracker),
     then `emet cleanup --run <runId>`. Then the Phase 9 hand-off: if
     more tickets can run, `emet chain` starts the next wave in a new session; if none can,
     the run ends with the final report. Details in `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-9-handoff.md`.
- **Phases 6–9** (every mode): dispatch → per-worker implementation → wave
  close-out → wave close and hand off. Read
  `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-6-7-dispatch.md` when you reach Phase 6
  (Phase 8 lives in `phases-8-review.md` and `phases-8-landing.md`, Phase 9 in `phases-9-handoff.md`;
  load each when you reach it, and re-read Phase 8 before every fix/review
  round), along with `${CLAUDE_PLUGIN_ROOT}/emet/reference/worker-prompt.md` (the dispatch prompt
  template) and `${CLAUDE_PLUGIN_ROOT}/emet/reference/tracker-<kind>.md` (`<kind>` from
  `emet.config.json`'s `tracker.kind`) for this repo's literal tracker
  calls. Workers dispatch as `subagent_type: "emet:emet-worker"`; Phase 8's
  review dispatches as `subagent_type: "emet:emet-reviewer"` from
  `${CLAUDE_PLUGIN_ROOT}/emet/reference/reviewer-prompt.md`'s template — both agent
  definitions pin their own model and effort (see the README's "Models &
  effort" section) and ship with the plugin.
- **`${CLAUDE_PLUGIN_ROOT}/emet/reference/incidents.md`** — the evidence behind the five non-negotiables
  below (real run failures, with what broke and how). Never loaded during a
  normal run; read it only when someone asks why a rule exists.

## Language

Read `language.conversation` and `language.artifacts` from `emet.config.json`
(both default to `en`). Answer the user in `language.conversation`. Write code,
comments, commit messages, PR text, tickets and docs in `language.artifacts`.

## Five non-negotiables

These apply in every mode, can't be paraphrased away by a reference file,
and are restated here so they're never missed even by a run that only ever
loads `phases-6-7-dispatch.md`:

1. Never dispatch a ticket without both `emet claims --reserve` and
   `emet slots --acquire` succeeding for it first.
2. Never call either through an inline snippet (e.g. `bun -e`) — always the
   `emet` CLI, exactly as documented in `${CLAUDE_PLUGIN_ROOT}/emet/reference/phases-6-7-dispatch.md`.
3. A worker never dispatches agents of its own — no `Agent` calls, no forks.
4. The coordinator is the single tracker writer: workers never write it. It
   writes a transition only where `tracker.transitions` names it
   `coordinator` or `worker` (`onStart`, written by the coordinator at
   dispatch) for that trigger — never where it's `automatic`.
5. Always report — success, failure, or blocked — never end a wave or a
   session silently.
