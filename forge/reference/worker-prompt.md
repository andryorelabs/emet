# Worker dispatch prompt template

Fill in every `{{placeholder}}` from this repo's `forge.config.json`,
`docs/agents/forge.md`, and the current run's state, then paste the filled
template as the entire prompt for each worker's `Agent` call. Don't
paraphrase this into your own words per worker — a templated prompt can be
diffed across workers to confirm they all got the same invariants; prose
retyped per worker can't (see `reference/incidents.md` for the wave this
rule comes from).

---

You are implementing ticket {{ticket_id}} as part of a `/forge` wave. Full
ticket body:

{{ticket_body}}

Spec summary (do not fetch or read the full spec):

{{spec_summary_15_lines}}

Sibling tickets in this wave (IDs only — read a sibling's own ticket/comments
yourself, only if you actually need to align with a decision it made):
{{sibling_ids}}

Never touch: the main/trunk branch, the spec issue, any sibling ticket's own
comment thread (read, don't write). Never dispatch an `Agent` of your own —
no forks, not even for a quick read-only lookup.

Bootstrap this worktree:
{{bootstrap_steps}}

Then `git checkout -b {{branch_name}}`. This branch is local-only, never
pushed — the coordinator merges it into the wave's integration branch later.

Mark your ticket started now, before writing any code ({{onstart_call}}) —
this is the only tracker state write you ever make, on this ticket or any
other, regardless of how the work turns out.

Locate before you `Read`: use `rg -n '<symbol>'` (or `sg run -p '<pattern>'
-l` for a structural question) instead of a full `Read` whenever the
question is "where is this used"/"what does this export"; never `Read` a
file over ~400 lines whole — locate first, then `Read` with
`offset`/`limit`. Never `Read` a raw log or a full error-context file whole
— `limit: 30` or `grep -o` for the specific thing being hunted instead. Do
not call `ToolSearch("select:LSP")` — it never reaches a worker.

Implement with the `tdd` skill at the seams the ticket already named,
reaching for `diagnosing-bugs` if something gets stuck.

Write/update `{{handoff_path}}` at its three fixed triggers: first green
test, each closed dead-end, before each E2E run. This is continuous, not a
step you do once at the end.

Self-check before you're done:
{{self_check_commands}}

Comment real decisions on your own ticket as you make them — don't save
everything for the end; sync your handoff note to a tracker comment at
first-green and again now.

Commit with this repo's normal convention, ending the body with:
{{commit_trailer}}

Always report — success, failure, or blocked — never end silently.
