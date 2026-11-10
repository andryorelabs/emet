# Worker dispatch prompt template

Fill in every `{{placeholder}}` from this repo's `emet.config.json`,
`docs/agents/emet.md`, and the current run's state, then paste the filled
template as the entire prompt for each worker's `emet dispatch` call. Don't
paraphrase this into your own words per worker — a templated prompt can be
diffed across workers to confirm they all got the same invariants; prose
retyped per worker can't (see `references/incidents.md` for the wave this
rule comes from).

`{{worktree_lock_reason}}` is the one placeholder you must **not** write by
hand. Get it per ticket, from your own shell, before the `emet dispatch` call:

```
emet lock-reason --run <runId> --ticket <ticket>
```

Paste its stdout verbatim. It has to be produced by _you_, in _your_ cwd:
the reason carries your `slug=` (the coordinator's own Claude Code project
slug), and a worker running that same command inside its worktree would
stamp the worktree's slug instead — under which no transcript exists, so
`emet preflight` and `emet cleanup` could never classify your run as
`idle` and would treat it as dead the moment your anchor process exits.

Other placeholders: `{{expected_base}}` is your `git rev-parse HEAD` at
dispatch (also the `baseline` in the dispatch record); `{{global_constraints}}`
is the spec's `## Global Constraints` copied verbatim (`none` if absent);
`{{codebase_map_sections}}` is `emet map --for <the ticket's surface globs>`
(`none` if no map); `{{trunk}}` is the trunk branch name; `{{run_id}}` is the
run.

---

You are implementing ticket {{ticket_id}} as part of a `$emet:run` wave. Full
ticket body (its `## Interfaces` block, if any, is the contract you build to):

{{ticket_body}}

A `Model:` line in the ticket above is the coordinator's instruction for
which model runs this worker (Phase 6 resolved it with `resolveWorkerModel`
and passed it to `emet dispatch`); it is already applied. Say so in your report only
if the work shows the ticket was mis-tiered.

Spec: {{spec_id}}. Read only its `## Specs` section yourself, via the
tracker (`{{spec_read_call}}`) — the verbatim requirements `S1..Sn`. Your
ticket's `Covers:` line names the S# you own; your report and handoff state
which you covered (and any you could not).

## Global Constraints

{{global_constraints}}

## Codebase map (sections for your edit surfaces)

{{codebase_map_sections}}

Sibling tickets in this wave (IDs only — read one's ticket/comments yourself
only if you need to align with a decision it made):
{{sibling_ids}}

Never touch: the main/trunk branch, the spec issue, any sibling ticket's own
comment thread. **You never write the tracker** — no state change, label, or
comment, on any ticket. The coordinator is the single writer; your channel is
the handoff note and the result file below. Never dispatch an `emet dispatch` of your
own — no forks, not even for a quick read-only lookup.

When you need a decision only the coordinator can make, ask it with (`<runId>` and `<ticket>` are the run id and your ticket id from this prompt) `emet ask --run <runId> --ticket <ticket> --body "<question>"`, which prints `{"id":<n>}`. Then poll `emet ask --run <runId> --ticket <ticket> --wait <n>` until it exits 0 with the reply on stdout: exit 3 means the slice elapsed with no reply yet, so run it again; exit 4 means the wait budget is spent, so write a BLOCKED result with `emet results --write` and exit.

Bootstrap this worktree, in this order:

0. Claim it, as the very first thing you do:

   ```
   git worktree unlock . 2>/dev/null; git worktree lock . --reason '{{worktree_lock_reason}}'
   ```

   Use `.` (the isolation guard refuses a subshell in the target). The
   `unlock` is required: the harness usually pre-locks the worktree with a
   generic reason, and `lock` over a lock fails. Paste the reason exactly —
   don't regenerate it or fix its `slug=`; `emet preflight --post-dispatch`
   attributes your worktree to the run by it. Verify: `git worktree list
   --porcelain` shows a `locked emet run=…` line for this directory. The
   harness unlocks on exit; the coordinator's reservations outlive it.

   Never use `run_in_background: true` for anything you intend to wait on —
   you get no completion notification. Run it in the foreground, with a
   `timeout` wrapper if it might hang.

1. Branch/base check, before anything else touches the tree:
   `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD`. Exit **42**
   at once, writing nothing, if HEAD is detached, is `{{trunk}}`, is outside
   the `worktree-agent-*` namespace, or differs from
   `EXPECTED_BASE={{expected_base}}`. Report `BLOCKED: base check failed
   (<observed>)`. Never `git reset`, `update-ref`, or rebase to repair it —
   the coordinator re-dispatches.

2. {{bootstrap_steps}}

3. `git checkout -b {{branch_name}}`. Local-only, never pushed.

Then write `.emet/surface.json` as `{"surfaces": [<globs from your ticket's
"Allowed edit surfaces">]}` (create `.emet/`); the edit guard blocks writes
outside them. Never commit it: first run
`echo .emet/surface.json >> "$(git rev-parse --git-path info/exclude)"`.

Locate before you `Read`: `rg -n '<symbol>'` (or `sg run -p '<pattern>' -l`)
for "where is this used"; never `Read` a file over ~400 lines whole — locate,
then `Read` with `offset`/`limit`; never `Read` a raw log or full
error-context file (`limit: 30` or `grep -o`). Do not look for an LSP tool — it never reaches a worker. Batch independent
tool calls in one message; read each file once.

Load every skill in your ticket's `## Project skills` by invoking it as a skill
(or `Read` `.claude/skills/<name>/SKILL.md`); follow them alongside `tdd`. If
one conflicts with the ticket's own hand-off, the ticket wins — record the
conflict in your handoff note.

{{known_environmental_failures}}

Implement with the `tdd` skill at the seams the ticket already named,
reaching for `diagnosing-bugs` if stuck.

Write/update `{{handoff_path}}` at its three fixed triggers: first green
test, each closed dead-end, before each E2E run. Continuous, not once at the
end. Real decisions go there too; the coordinator posts them to the tracker.

Self-check before you're done:
{{self_check_commands}}

Commit with this repo's normal convention, ending the body with:
{{commit_trailer}}

## Reporting

1. Write the full report (changes, decisions, S# covered or not, dead-ends,
   test output tail) to a file, then record it:
   `emet results --run {{run_id}} --write {{ticket_id}} --status
   <DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT> --report .emet/report-{{ticket_id}}.md (untracked; never commit it) --risk
   "<Risk: …>"`.
2. Your final message is at most **15 lines**: status, S# covered, commit
   SHA(s), one line per concern/blocker, the report path. No diffs, no logs.
3. Its last line is `Risk: none` or `Risk: item N (reason)`. Before writing
   `none`, `rg` the callers of every shared function, type, or config you
   changed and confirm each still holds; a changed shared signature is never
   `none`.

Always report — success, failure, or blocked — never end silently.

`{{known_environmental_failures}}` is a `## Known environmental failures`
section listing the checks that already fail on trunk (Phase 6 computes it),
or `none`. A failure on that list is not yours: don't fix it; note it as
pre-existing.
