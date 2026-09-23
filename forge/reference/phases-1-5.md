# Phases 1–5 — interview through materialize

Loaded only in the default and `--draft` modes; `--dispatch` skips straight
to `phases-6-9.md`.

## Phase 1 — Interview

Reach a shared understanding of $ARGUMENTS by calling the Skill tool twice —
`grilling` (relentless interview to sharpen the plan) then `domain-modeling`
(reconcile terminology against `CONTEXT.md`/`docs/adr/` per
`docs/agents/domain.md`) — the same two calls `grill-with-docs` itself makes
(that skill is user-invocable only, not model-invocable, so call its two
underlying skills directly instead of trying to invoke it by name). Any
`CONTEXT.md`/`docs/adr/` edit `domain-modeling` proposes is **not written
yet** — note it in the plan file and apply it in Phase 5, alongside every
other write this run makes.

If the feature touches a screen (judge this yourself from the interview; the
user isn't asked to classify it), don't publish the design here — publishing
is a write and this phase is inside plan mode. Instead, describe in the plan file
what an artboard would need: one screen description per screen, plus the
states a worker would otherwise improvise badly alone (empty, error,
loading). Confirm the UI/non-UI classification with the user at the end of
this phase — it's the one moment they're actually present for it. The actual
canvas gets designed and published in Phase 5, right after the plan is
approved.

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

## Phase 3 — Tickets

Read
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering/to-tickets/SKILL.md`
and follow its tracer-bullet breakdown (with blocking edges), but write the
tickets **into the plan file** instead of publishing them — same reason as
Phase 2. Reinforce two rules on top of the skill's own breakdown:

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
- List this repo's project skills once (`ls .claude/skills/*/SKILL.md`; read only
  each file's frontmatter — `head -n 10`, never the full body). For every
  ticket, write a mandatory `## Project skills` section listing only the
  skills relevant to *that ticket's* own task — never the whole catalog,
  never a blanket "all UI skills" — one line per skill:
  `- <name> — <why it applies>`, or `none` if nothing matches or the repo has
  no `.claude/skills/`. Relevance is the only selection criterion; prefer a
  specific skill over a generic one, and let the `## Context budget` tripwire
  below split the ticket if the relevant set gets heavy.
- Every ticket carries a mandatory `## Context budget` section, computed
  mechanically (`wc -l`/`grep -c` against the actual files it touches, not a
  guess), so sizing is checkable before any code exists:

  ```markdown
  ## Context budget
  Touch set:     N files, M lines to read
  New surface:   ~X new lines
  Verification:  unit + e2e estimate
  Siblings:      K tickets × ~2K (comments a worker reads before starting)
  Estimated peak: ~Y K. PASS if < 160K.
  ```

  Add each `## Project skills` entry's own `SKILL.md` line count into the
  touch-set estimate — it's context the worker reads too.

  Split the ticket into two (same wave, parallel, no extra close-out cost) if
  any tripwire fires: estimated peak > 160K; touch set > 8 files or > 1,500
  lines; new surface > 500 lines; more than one new E2E spec in the ticket;
  or a new page object **and** a new spec in the same ticket — that exact
  shape produced the single largest worker context measured (348K) against
  an almost-identical sibling ticket that stayed at 129K (see
  `reference/incidents.md`).

## Phase 4 — The one freeze point

Write the complete plan to the plan file: the spec, every ticket with its
blockers and its `## Project skills` picks, and **who's doing what** — which tickets are unassigned (a worker
will take them) and which are assigned to a human (skipped entirely, they're
doing those by hand). This doubles as the safety net against "I meant to
assign myself that one and forgot" — the whole dispatch plan is visible
before anything launches.

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
   tool directly — never invoke `/design` or ask the user to run it. In
   current Claude Code `/design` resolves to a mode that's user-invocable
   only (see `reference/incidents.md` for why); the forge's own canvases were
   never the Claude Design editor anyway — they're a plain single-page HTML
   the model writes itself (nav + one `<section class="artboard">` per
   screen + a state switch for empty/error/loading + a hand-off block per
   artboard), so the `Artifact` tool reproduces them exactly:
   - **This product area already has a canvas** (URL in
     `docs/design/README.md`'s index): `Artifact action:"read"` its URL, Read
     the saved file in full, append one artboard section (plus its nav
     button) per new screen reusing the page's existing classes/tokens, mark
     any superseded artboards with the page's own historical note, then
     `Artifact` publish that file back with `url` — same URL, living canvas,
     never a new canvas per feature; split an area only once two features
     collide over the same screen.
   - **This product area has no canvas yet**: read an existing canvas from
     `docs/design/README.md` as the template for chrome/CSS/patterns and
     publish a new one with the same structure (first publish, set `icon`).
     If the repo has no canvas at all yet, load the `artifact-design` skill
     and build the nav + artboards + state-switch + hand-off structure from
     scratch.
   - One artboard per screen plus empty/error/loading states, static mockups
     only. This is the one write in this run that needs a live permission
     prompt (publishing can't be skipped) — the user is still around right
     after approving the plan. Update `docs/design/README.md`'s table.
3. Create the spec issue and every ticket from the plan file per
   `docs/agents/issue-tracker.md`'s literal calls for this repo's tracker —
   set each ticket's state to the tracker's initial dispatch-eligible state
   explicitly (never leave it unset — some trackers default an issue with no
   state to a backlog-equivalent that never reaches the dispatch frontier),
   apply the triage label from `docs/agents/triage-labels.md` that marks it
   ready for automatic dispatch, plus `blockedBy` and priority — UI tickets
   now carry the real hand-off from the published canvas (measurements,
   states, copy, the artboard's name). Don't apply the ready-for-dispatch
   label to the spec issue itself — it's the container, not a ticket.

**`--draft` stops here.** Print the spec issue's ID as the handle for a
later `--dispatch <spec-id>` — in this session or a fresh one — and end the
run. Don't continue into Phase 6. The default mode continues straight into
Phase 6, same as it always has.
