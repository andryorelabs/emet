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
Whenever this session ends a wave — frontier empty or not — right after
posting its report, run `forge guard --mark-final-report <session id>` (the
id is printed in the `Stop` hook's block message); the
hook only blocks once no worker is in flight and claims remain, so a turn
spent waiting on workers is never blocked.

**If the frontier is non-empty, do not loop back to Phase 6 in this same
session.** Waves chain across sessions, not within one — each session pays
its fixed startup cost once and carries one wave's worth of growing context,
instead of one session accumulating every wave in the run (see
`docs/agents/forge.md`'s "Concurrency" section for the reasoning). Instead:

1. Report this wave's outcome (PR link, what shipped, what got flagged) —
   the same content a mid-run status update would carry, just written down
   instead of only said.
2. Hand off to the next wave. If `handoff.autoChain` is `true` **and** this
   wave's PR actually merged **and** nothing was flagged (the next wave
   builds on the merged trunk, so an open or flagged PR always means a human
   step), launch it yourself:
   - Run `forge launch <spec-id> --wave <n+1>` from the repo root, as its
     own Bash call. It refuses when a live `forge-<spec-id>-*` session
     already exists, runs `claude --bg --name forge-<spec-id>-w<n+1>
     --permission-mode <handoff.permissionMode> "/forge --dispatch
     <spec-id>"`, confirms the session appears in `claude agents --json`,
     and — per `handoff.launcher` — opens an Orca tab running `claude attach
     forge-<spec-id>-w<n+1>`. It prints one JSON line:
     `{ name, id, attach, orcaTab: { opened, reason } }`.
   - The permission mode comes from the config (default
     `bypassPermissions`), **not** from this session: in `auto` mode the
     classifier can deny a step like `gh pr merge` mid-wave and leave the
     wave half-finished. `permissions.deny` rules and the `forge guard`
     hook still apply in bypass. If Claude Code refuses the launch in that
     mode (the bypass warning was never accepted interactively), relaunch
     by hand with this session's own mode and say so in the report.
   - Put `name` and `attach` in this wave's report, plus `orcaTab.reason`
     when `orcaTab.opened` is `false`. A failed tab never stops the chain:
     the wave already runs in the background, so report the `claude attach`
     command. If `forge launch` itself exits non-zero, fall through to the
     manual path below and report why.
   - `launcher: auto` detects Orca by asking its runtime (`orca status`),
     not `$TERM_PROGRAM`: a `claude --bg` session has no `TERM_PROGRAM`, so
     an env check would never fire on a chained launch.

   The same command covers a launch the user asks for by hand ("run the
   wave in another session", including wave 1 of a `--draft` spec): use
   `forge launch <spec-id> --wave <n>`, never a bare `claude --bg`, which
   skips the Orca tab and the duplicate-session check.

   Otherwise (`autoChain` is `false`, or the PR is open or flagged), print,
   verbatim, the command for the next wave: `/forge --dispatch <spec-id>`
   (the same spec issue this whole run has been using as parent).
3. End the session here. When it was not auto-chained, a human runs that
   command — in this terminal or a fresh one — to continue. This mirrors
   exactly the `--draft`/`--dispatch` split already described in "Modes":
   nothing about wave computation depends on which session created the spec
   or dispatched any prior wave, since the frontier is always recomputed
   fresh from the tracker.
