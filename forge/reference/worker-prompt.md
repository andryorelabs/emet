# Worker dispatch prompt template

Fill in every `{{placeholder}}` from this repo's `forge.config.json`,
`docs/agents/forge.md`, and the current run's state, then paste the filled
template as the entire prompt for each worker's `Agent` call. Don't
paraphrase this into your own words per worker — a templated prompt can be
diffed across workers to confirm they all got the same invariants; prose
retyped per worker can't (see `reference/incidents.md` for the wave this
rule comes from).

`{{worktree_lock_reason}}` is the one placeholder you must **not** write by
hand. Get it per ticket, from your own shell, before the `Agent` call:

```
forge lock-reason --run <runId> --ticket <ticket>
```

Paste its stdout verbatim. It has to be produced by *you*, in *your* cwd:
the reason carries your `slug=` (the coordinator's own Claude Code project
slug), and a worker running that same command inside its worktree would
stamp the worktree's slug instead — under which no transcript exists, so
`forge preflight` and `forge cleanup` could never classify your run as
`idle` and would treat it as dead the moment your anchor process exits.

---

You are implementing ticket {{ticket_id}} as part of a `/forge` wave. Full
ticket body:

{{ticket_body}}

A `Model:` line in the ticket above is the coordinator's instruction for
which model runs this worker (Phase 6 passes it as the `Agent` `model`
parameter). It is already applied by the time you read this; nothing to do
unless your work shows the ticket was mis-tiered (then say so in your report).

Spec: {{spec_id}}. Read only its `## Specs` section yourself, via the
tracker (`{{spec_read_call}}`) — the verbatim requirements `S1..Sn`, and
nothing else of the spec. Your ticket's `Covers:` line names the S# you own.
In your final report and handoff, state which S# you covered (and any you
could not).

Sibling tickets in this wave (IDs only — read a sibling's own ticket/comments
yourself, only if you actually need to align with a decision it made):
{{sibling_ids}}

Never touch: the main/trunk branch, the spec issue, any sibling ticket's own
comment thread (read, don't write). Never dispatch an `Agent` of your own —
no forks, not even for a quick read-only lookup.

Bootstrap this worktree, in this order:

0. Claim it, as the very first thing you do — before installing anything,
   before checking out a branch, before reading a single file:

   ```
   git worktree unlock . 2>/dev/null; git worktree lock . --reason '{{worktree_lock_reason}}'
   ```

   Use `.`, not `$(git rev-parse --show-toplevel)` — the isolation guard
   refuses a git invocation too complex for it to verify stays inside your
   own worktree, and a subshell inside the target argument is exactly that
   shape. The leading `unlock` is not optional: your worktree usually
   arrives already locked by the harness itself (a generic `claude agent
   agent-<id> (pid …)` reason, not `/forge`'s own shape), and `lock`
   over an existing lock fails outright — `unlock` first, silencing the
   "not locked" error on the rare worktree that arrives unlocked, then
   `lock` unconditionally.

   Paste the reason exactly as given — don't regenerate it, don't run
   `forge lock-reason` yourself, don't "fix" the `slug=` field to match this
   worktree. It's what attributes this worktree to the run that dispatched
   you; without it your worktree is indistinguishable from an unrelated
   interactive one, and the coordinator's `forge preflight --post-dispatch`
   (which runs within ~30s of your dispatch) hard-fails the whole wave.
   Verify it took before moving on — `git worktree list --porcelain` must
   show a `locked forge run=…` line for this directory.

   This lock does not survive you: the harness unlocks this worktree itself
   the moment your agent process exits, regardless of whether your work is
   done — see `reference/incidents.md`. That's expected and handled on the
   coordinator's side (ticket reservations outlive the lock); it's not
   something you can prevent or need to work around.

   Never call `Bash` with `run_in_background: true` for anything you intend
   to wait on — you are a worker, not the top-level session, and you get no
   completion notification for a backgrounded process; it will run
   unattended with nothing to resume you. Run it in the foreground, with a
   `timeout` wrapper if it might hang.

1. {{bootstrap_steps}}

2. `git checkout -b {{branch_name}}`. This branch is local-only, never
   pushed — the coordinator merges it into the wave's integration branch
   later.

Mark your ticket started now, before writing any code ({{onstart_call}}) —
this is the only tracker state write you ever make, on this ticket or any
other, regardless of how the work turns out.

Your first step after bootstrap, before anything else: write
`.forge/surface.json` in your worktree as `{"surfaces": [<globs from your
ticket's "Allowed edit surfaces">]}` (create `.forge/` if missing). The edit
guard blocks writes outside those globs. Never commit it:
run `echo .forge/surface.json >> "$(git rev-parse --git-path info/exclude)"` first.

Locate before you `Read`: use `rg -n '<symbol>'` (or `sg run -p '<pattern>'
-l` for a structural question) instead of a full `Read` whenever the
question is "where is this used"/"what does this export"; never `Read` a
file over ~400 lines whole — locate first, then `Read` with
`offset`/`limit`. Never `Read` a raw log or a full error-context file whole
— `limit: 30` or `grep -o` for the specific thing being hunted instead. Do
not call `ToolSearch("select:LSP")` — it never reaches a worker.

Batch independent tool calls: when two or more calls don't depend on each
other's output (several `Read`s, `rg`s, `gh` reads), issue them in a single
message. Read each file once — keep what you learned instead of re-reading
it, and re-read only after something else changed it.

Before writing any code, load every skill listed in your ticket's
`## Project skills` section with the `Skill` tool; if one isn't available to
you, `Read` `.claude/skills/<name>/SKILL.md` in your worktree instead. Follow
them alongside `tdd`; where a project skill conflicts with the ticket's own
hand-off, the ticket wins — note the conflict in a ticket comment rather than
silently picking one.

{{known_environmental_failures}}

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

`{{known_environmental_failures}}` is a `## Known environmental failures`
section listing the checks that already fail on trunk (Phase 6 computes it),
or `none`. A failure on that list is not yours: do not try to fix it, and
note in your report that it was pre-existing.
