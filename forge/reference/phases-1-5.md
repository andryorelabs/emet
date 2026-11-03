# Phases 1–5 — interview through materialize

Loaded only in the default and `--draft` modes; `--dispatch` skips straight
to `phases-6-7-dispatch.md`.

## Phase 1 — Interview

Reach a shared understanding of $ARGUMENTS by calling the Skill tool twice —
`grilling` then `domain-modeling` (terminology against `CONTEXT.md`/`docs/adr/`
per `docs/agents/domain.md`); `grill-with-docs` is user-invocable only, so call
its two skills directly. Any `CONTEXT.md`/`docs/adr/` edit `domain-modeling`
proposes is **not written yet** — note it in the plan file, apply in Phase 5.

Interview in **frontier rounds**, not one question at a time. Each round asks
every currently unblocked decision together; each carries a `➡️` recommended
answer, so the user can reply "yes" to accept all. A decision answerable from
the repo or docs is not asked: have a fresh-context subagent look the fact up
and state it. Answers unblock the next round. Soft cap: after ~4 rounds, or
once only low-stakes decisions remain, wrap up — list the leftovers with their
`➡️` defaults and ask one "go with these?".

If the feature touches a screen (judge this yourself), don't publish the
design here — publishing is a write and this phase is inside plan mode.
Describe in the plan file one screen description per screen, plus the states
a worker would otherwise improvise badly (empty, error, loading). Confirm the
UI/non-UI classification with the user at the end of this phase. The canvas is
published in Phase 5.

If the interview ends with real fog — open questions that don't resolve by
talking, because they need research, a prototype, or a decision nobody can
make from a chair — tell the user to run the `wayfinder` skill themselves
(it's user-invocable only, not something this command can call) instead of
forcing a spec that fakes certainty, and stop here. `wayfinder` is HITL by
design (one ticket per session, never answers for the human) and never runs
inside Phases 5–9. If adopted, its map/tickets use
`docs/agents/issue-tracker.md`'s "Wayfinding operations" section; loop back
to Phase 1 once its map clears.

## Phase 2 — Spec

Read
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering/to-spec/SKILL.md`
(glob the version — don't hardcode it) and follow its synthesis template,
but write the result **into the plan file**, not to the issue tracker —
`to-spec` is user-invocable only and its own publish step is a write that
can't happen inside plan mode. Section it as a spec block per
`docs/agents/issue-tracker.md`'s conventions, ready to be published verbatim
in Phase 5.

Put the requirements in a `## Specs` section, numbered `S1..Sn`, one per
line (`- **S1**: …`). Quote the user's own strings, commands and examples
verbatim inside each one — never paraphrase them. Tickets and prompts cite
these numbers, and workers read this section directly from the tracker, so
whatever is not in `## Specs` does not reach them. Give every S# an
acceptance scenario (`Scenario: WHEN … THEN …`).

Add two more sections to the spec block. `## Global Constraints`: rules every
worker and reviewer must obey (the harness copies it into each brief).
`## Review Focus`: inputs the spec implies but nothing tests — each gets a test.

## Phase 3 — Tickets

Read
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering/to-tickets/SKILL.md`
and follow its tracer-bullet breakdown (with blocking edges), but write the
tickets **into the plan file** instead of publishing them — same reason as
Phase 2. Reinforce two rules on top of the skill's own breakdown:

- Every ticket declares a `Covers: S…` line right under its title, listing
  the `## Specs` numbers it implements (e.g. `Covers: S2, S3`). Every S#
  must be covered by at least one ticket; a ticket covering none is
  unjustified scope.
- Every ticket carries `## Interfaces`: `Consumes:` / `Produces:` with
  signatures, so parallel workers agree on the seams.
- Fast path: a unit of ≲100 changed lines (`sizing.inlineMaxLines`) that
  passes the resume-from-diff test is folded into a sibling worker's ticket
  (one worktree), never given its own. If the whole request is below that
  threshold, write no tickets: one worker plus review.
- Any change to a path listed in `schema.ownedPaths` (`forge.config.json`)
  goes in exactly one ticket, first in the dependency chain, blocking every
  other ticket that touches the feature — see `docs/agents/forge.md` for why
  a schema conflict can't be resolved like a text conflict. An empty
  `schema.ownedPaths` means this repo declared no such path — skip the rule.
- For every UI ticket, write the actual hand-off into the ticket body —
  measurements, states, copy, responsive behavior — from the screen
  descriptions captured in Phase 1, and name the artboard it will become
  (e.g. `Pricing.dc.html`). A UI ticket with no named artboard means that
  screen was never designed: mark it explicitly rather than let the worker
  improvise the interface.
- Optional `Model:` line (e.g. `Model: opus`, or `Model: opus/high` for model/effort),
  right under `Covers:`. Set it only when the ticket's own files match what
  `forge assess` calls high-risk (auth, security, payments, webhook, CI,
  installer, lockfiles, migrations, dangerous sinks, or a path listed in
  `review.highRiskPaths`). It overrides `models.worker` for that worker
  alone; omit it everywhere else so the default worker applies and existing
  repos behave as before. Phase 6 passes it as the `Agent` `model` parameter.
- List this repo's project skills once (`ls .claude/skills/*/SKILL.md`; read only
  each file's frontmatter — `head -n 10`, never the full body). For every
  ticket, write a mandatory `## Project skills` section listing only the
  skills relevant to *that ticket's* own task — never the whole catalog,
  never a blanket "all UI skills" — one line per skill:
  `- <name> — <why it applies>`, or `none` if nothing matches or the repo has
  no `.claude/skills/`. Relevance is the only selection criterion; prefer a
  specific skill over a generic one, and let the `## Context budget` tripwire
  below split the ticket if the relevant set gets heavy.
- Every ticket carries a mandatory `## Allowed edit surfaces` section: the
  globs it may edit, one line, comma-separated (e.g. `src/foo.ts, tests/foo/**`); no brace
  globs (`{a,b}`) — list each path separately.
  Same-wave tickets must not overlap; Phase 6 enforces it with
  `forge surfaces --check`.
- Every ticket carries a mandatory `## Context budget` section, computed
  mechanically (`wc -l`/`grep -c` against the actual files it touches, not a
  guess), so sizing is checkable before any code exists:

  ```markdown
  ## Context budget
  Touch set:     N files, M lines to read
  New surface:   ~X new lines
  Verification:  unit + e2e estimate
  Siblings:      K tickets × ~2K (comments a worker reads before starting)
  Estimated peak: ~Y K (= `estimatedPeakTokens`). PASS if < 160K.
  ```

  Add each `## Project skills` entry's own `SKILL.md` line count into the
  touch-set estimate — it's context the worker reads too.

  Lower tripwire: a ticket with New surface <=~100 lines merges into an
  adjacent same-wave sibling (files nearby). Never split one behavior into
  separate code, test, and docs tickets.

  Split the ticket into two (same wave, parallel, no extra close-out cost) if
  any tripwire fires: estimated peak > 160K; touch set > 8 files or > 1,500
  lines; new surface > 500 lines; more than one new E2E spec in the ticket;
  or a new page object **and** a new spec in the same ticket (348K vs 129K
  for an almost-identical sibling; see `reference/incidents.md`).

Before Phase 4, run `forge validate --file <plan.json | ->` (usage:
`forge validate --help`; plan = spec markdown + tickets with `covers`,
`surfaces`, `wave`, `blockedBy`, `newSurfaceLines`, `folded`). Fix every error
(uncovered S#, ticket covering nothing, missing scenario, overlapping wave
surfaces, dependency cycle) and re-run until it exits 0; warnings, like an
unfolded small ticket, need a fold or a reason.

## Phase 4 — The one freeze point

Write the complete plan to the plan file: the spec, every ticket with its
blockers and `## Project skills` picks, and **who's doing what** — tickets
unassigned (a worker takes them) vs assigned to a human (skipped entirely).
The whole dispatch plan is visible before anything launches.

Call `ExitPlanMode` to request approval. This **is** the one OK — nothing
below this line asks another question (aside from the one design-publish
permission prompt in Phase 5, which the user is still present for).

(This phase — and every phase before it — only runs in the default mode or
`--draft`. `--dispatch <spec-id>` skips straight to Phase 6; see "Modes" in
the main command file.)

## Phase 5 — Materialize

Now that the plan is approved, in this exact order:

1. Apply the `CONTEXT.md`/`docs/adr/` edits deferred from Phase 1.
2. If the feature touches a screen: publish the canvas now with the `Artifact`
   tool directly — never invoke `/design` or ask the user to run it (it is
   user-invocable only; see `reference/incidents.md`). A canvas is a plain
   single-page HTML you write: nav + one `<section class="artboard">` per
   screen + empty/error/loading state switch + a hand-off block per artboard.
   - **Area already has a canvas** (URL in `docs/design/README.md`):
     `Artifact action:"read"` it, Read the saved file in full, append one
     artboard (plus nav button) per new screen reusing its classes/tokens,
     mark superseded artboards with its historical note, republish with
     `url` — same URL, never a new canvas per feature; split an area only
     once two features collide over a screen.
   - **No canvas yet**: use an existing one as the template and publish a new
     one (set `icon`); if the repo has none, load the `artifact-design` skill.
   - Static mockups only. The one write needing a live permission prompt;
     update `docs/design/README.md`'s table.
3. Create the spec issue and every ticket per `docs/agents/issue-tracker.md`'s
   literal calls: each ticket's state set explicitly to the dispatch-eligible
   one (unset can default to a backlog that never reaches the frontier), the
   ready-for-dispatch label from `docs/agents/triage-labels.md`, plus
   `blockedBy` and priority; UI tickets carry the real hand-off from the
   canvas. Never label the spec issue itself. Before each create run
   `forge materialize-log --run <id> --lookup <localKey>` (exit 0 = already
   created, skip); right after, `--record <localKey> <trackerId>` — an
   interrupted run never duplicates.
4. `forge approve --run spec<spec-id> --spec <file> [--tickets <file>]` writes
   `approval.json` (spec and ticket hashes; write the ticket list to `.forge/runs/spec<spec-id>/tickets.json` first); Phase 6 refuses to dispatch when
   `approve --check` reports a change.

**`--draft` stops here.** Print the spec issue's ID as the handle for a
later `--dispatch <spec-id>` — in this session or a fresh one — and end the
run. Don't continue into Phase 6. The default mode continues straight into
Phase 6, same as it always has.
