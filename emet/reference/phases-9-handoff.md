# Phase 9 — wave close and hand off

Follows Phase 8 (`phases-8-closeout.md`); dispatch is in
`phases-6-7-dispatch.md`.

## Phase 9 — Wave close and hand off

Retry a single failed ticket once within its own wave, still in this
session — this is closing out the wave that just ran, not starting the next
one. On a second failure, apply the appropriate label (`needs-info` if it
needs more context, the human-decision label if it needs a decision an
agent shouldn't make — see `docs/agents/triage-labels.md`) and let the rest
of that wave proceed.

Recompute the frontier (some tickets may have just unblocked now that this
wave's tickets are done).

**If the frontier is empty** — no further wave is possible — stop and
produce the **final report, always, exactly once**: every wave's PR link,
what shipped, what got flagged and why, and what's still waiting on a human
decision. This is the terminal case regardless of which mode started this
session (default, `--draft`+`--dispatch`, or a chained `--dispatch`).
Append `emet metrics --run <run id>` output (tokens, $, wall time per
run/wave/ticket; peak context vs estimate) to the final report, and point the
user to `emet insights` for how the run compares with earlier ones.

**Every wave's final report starts with a three-line TL;DR**: what landed,
what needs a person, and the next step. Take them from `emet status --brief`, which
prints at most three lines (overall state, what waits on a person if anything,
next action); when nothing waits on a person it prints two, and the "needs a
person" line says `nothing`. Right after posting the report, send one
push notification whose text is that same TL;DR.

Whenever this session ends a wave — frontier empty or not — right after
posting its report, run `emet guard --mark-final-report <session id>` (the
id is printed in the `Stop` hook's block message); the
hook only blocks once no worker is in flight and claims remain, so a turn
spent waiting on workers is never blocked.

**If the frontier is non-empty, do not loop back to Phase 6 in this same
session.** Waves chain across sessions, not within one — each session pays
its fixed startup cost once and carries one wave's worth of growing context,
instead of one session accumulating every wave in the run (see
`docs/agents/emet.md`'s "Concurrency" section for the reasoning). Instead:

1. Report this wave's outcome (PR link, or in merge mode the `emet land`
   trunk sha or the unmerged integration branch; what shipped, what got
   flagged) —
   the same content a mid-run status update would carry, just written down
   instead of only said.
2. Hand off to the next wave. Chain only when Phase 8's `emet gate <ticket>
   --waves-remaining <n>` answered `chain` for every ticket of this wave (it
   folds in `handoff.autoChain`, the merged PR, the green integration suite,
   and nothing flagged); anything else — `merge` without `chain`, `hold`,
   `stop`, `defer` — is a human step. To chain, launch it yourself:
   - Run `emet chain --spec <spec-id> --wave <n+1> --ticket <ticket> --tier
     … --ci … --integration … --waves-remaining <n>` from the repo root, as
     its own Bash call, with the same gate flags as Phase 8. It runs `emet
     gate`, and only on `chain` checks readiness (host memory, free disk and
     inodes in the repo and `/tmp`, the `orca` CLI) and launches like `emet
     launch <spec-id> --wave <n+1>`. Any other decision, a blocking readiness
     problem (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) or an
     existing session for that spec and wave exits 1 with the reasons and
     launches nothing: report them and use the manual path below. The launch
     refuses when a live `emet-<spec-id>-*` session
     already exists, runs `claude --bg --name emet-<spec-id>-w<n+1>
     --permission-mode <handoff.permissionMode> "/emet:run --dispatch
     <spec-id>"`, confirms the session appears in `claude agents --json`,
     and — per `handoff.launcher` — opens an Orca tab running `claude attach
     emet-<spec-id>-w<n+1>`. It prints one JSON line:
     `{ name, id, attach, orcaTab: { opened, reason } }`.
   - The permission mode comes from the config (default
     `bypassPermissions`), **not** from this session: in `auto` mode the
     classifier can deny a step like `gh pr merge` mid-wave and leave the
     wave half-finished. `permissions.deny` rules and the `emet guard`
     hook still apply in bypass. If Claude Code refuses the launch in that
     mode (the bypass warning was never accepted interactively), relaunch
     by hand with this session's own mode and say so in the report.
   - Put `name` and `attach` in this wave's report, plus `orcaTab.reason`
     when `orcaTab.opened` is `false`. A failed tab never stops the chain:
     the wave already runs in the background, so report the `claude attach`
     command. If `emet launch` itself exits non-zero, fall through to the
     manual path below and report why.
   - `launcher: auto` detects Orca by asking its runtime (`orca status`),
     not `$TERM_PROGRAM`: a `claude --bg` session has no `TERM_PROGRAM`, so
     an env check would never fire on a chained launch.

   The same command covers a launch the user asks for by hand ("run the
   wave in another session", including wave 1 of a `--draft` spec): use
   `emet launch <spec-id> --wave <n>`, never a bare `claude --bg`, which
   skips the Orca tab and the duplicate-session check.

   Otherwise print, verbatim, the command for the next wave:
   `/emet:run --dispatch <spec-id>`.

3. End the session here. Unless auto-chained, a human runs that command to
   continue; the frontier is always recomputed fresh from the tracker, so
   nothing depends on which session ran any prior wave. Include "Rulings I
   made" (`emet review --rulings`) in the report.
