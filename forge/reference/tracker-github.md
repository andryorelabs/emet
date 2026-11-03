# Tracker: github — literal calls

The literal `gh` invocations behind the abstract ops. Priority/state label
names are this repo's `tracker.github.priorityLabels`/`stateLabels`
(`forge.config.json`) — `forge init` creates the three status labels via `gh
label create --force`; priority labels are created by hand if this repo
wants prioritized dispatch (an empty `priorityLabels` degrades to
`createdAt`-only ordering, and `forge doctor` says so).

- **spec.create**: `gh issue create --title "Spec: <feature>" --body <spec
  body>`. No status label — a spec issue is a container, not itself
  dispatched.
- **ticket.create**: `gh issue create --title --body --label <status:todo>,
  <triage label> --label <priority label>? --parent <spec issue number>`
  (`--parent` is a real `gh` 2.100+ flag; use it, not a body-text reference).
  Blocking edges: `gh issue edit <n> --add-blocked-by <m>` (or
  `--add-blocking`, whichever direction reads more naturally per ticket).
- **frontier.candidates**: `gh issue view <spec> --json subIssues` returns
  the whole child set in one call. Filter client-side for: no assignee, the
  `status:todo` label, the ready-for-dispatch triage label, and (from the
  same JSON) an empty/all-closed `blockedBy`/`blocking` set —
  `--json subIssues,subIssuesSummary` gets both in one round trip, unlike
  Linear's `list_issues` + N×`get_issue`.
- **ticket.read**: `gh issue view <n> --json title,body,labels,assignees,
  state`. **listComments**: `gh issue view <n> --json comments`.
- **ticket.setState**: `gh issue edit <n> --remove-label <old status
  label> --add-label <new status label>` for `onStart` (`status:todo` →
  `status:in-progress`, written by the coordinator at dispatch — workers never
  write the tracker); `onPrOpen`/`onPrMerge` per this
  repo's `tracker.transitions` — GitHub has no native workflow-state field,
  so these are usually `coordinator`-owned label swaps
  (`status:in-progress` → `status:in-review` on PR open), with `done` really
  meaning the issue itself closes (`state: closed`, `stateReason:
  completed`) via the PR's closing keyword rather than a fourth label.
- **ticket.setLabels**: `gh issue edit <n> --add-label <l> --remove-label
  <l>` (there's no single full-replace call — add/remove explicitly).
- **ticket.comment**: `gh issue comment <n> --body <text>`.
- **ticket.unassign**: `gh issue edit <n> --remove-assignee <@user>` (or
  the equivalent flag for this `gh` version — check `gh issue edit --help`).
- **order**: map each candidate's labels through `tracker.github.
  priorityLabels` to an integer, sort descending, `createdAt` ascending as
  the tiebreaker; with no `priorityLabels` configured, sort by `createdAt`
  ascending only.
- **state.isClosed**: `state == "closed"` (`stateReason` distinguishes
  `completed` from `not_planned`/canceled).
- **pr.referenceLines**: closing keyword `Closes #24, #25, #26` (GitHub's
  own multi-issue syntax) in the PR body; a bare `Refs: #24` commit trailer
  for a ticket touched but not finished by that commit.
- **branch.nameFor**: `<branchPrefix>-<issue number>-<slug>` — same
  derivation regardless of tracker.
