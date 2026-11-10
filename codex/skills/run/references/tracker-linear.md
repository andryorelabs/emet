# Tracker: linear — literal calls

The literal `mcp__linear-server__*` calls behind the abstract ops the
command uses. Team/workspace specifics (team key, project name) live in this
repo's own `docs/agents/issue-tracker.md`, not here — this file is the same
for every Linear-tracker repo.

- **spec.create**: `save_issue({ team: "<team key>", title: "Spec: <feature>",
  description: <spec body>, project: "<project>" })`. No `state` set — leave
  it in the team's default state; a spec issue is a container, not itself
  dispatched.
- **ticket.create**: `save_issue({ team, title, description, project,
  state: "Todo", labels: [...], parentId: <spec id>, priority: <1-4> })` —
  `state` must be set explicitly; an issue created with no `stateId` lands in
  the team's first Backlog-category state, which the dispatch frontier never
  sees.
- **frontier.candidates**: `list_issues({ team, parentId: <spec id>,
  assignee: null, state: "Todo" })` for candidates, then per candidate
  `get_issue({ id, includeRelations: true })` to read `blockedBy` —
  `list_issues` alone can never see relations.
  `assignee: null` only stays meaningful as "nobody's claimed this by hand"
  if one Linear personal preference stays off: **Settings → My Account →
  Preferences → Behavior → "On move to started status, assign to
  yourself."** If it's ever enabled, every ticket a worker moves to
  `In Progress` gets silently retro-assigned to whoever holds that Linear
  session's token, with no repo-side signal — there's no way to check this
  setting via the MCP tools, only by eye in Linear's UI.
- **ticket.read**: `get_issue({ id })`; `listComments({ issueId: id })` for
  its comments.
- **ticket.setState**: `save_issue({ id, state: "<name>" })`. The coordinator
  only calls this for a transition `tracker.transitions` marks `coordinator`
  — `onPrOpen`/`onPrMerge` are `automatic` here (Linear's own GitHub
  integration); `onStart` (`In Progress`) is written by the coordinator at
  dispatch, never by a worker. **`In Review` and `Done` are not both gated on the PR** when
  commit-message linking is on (see `pr.referenceLines` below): a worker's
  own `Refs:` trailer moves its ticket to `In Review` on push, independently
  of and often well before the wave PR exists — only `Done` waits for the
  PR body's closing keyword at merge. A ticket sitting in `In Review` is
  therefore no evidence anything will later close it. If a wave's PR merges
  with tickets still `In Review`, the closing line was missing or malformed
  on that PR — the merge webhook doesn't retry, so the one-time fix is a
  manual `save_issue({ id, state: "Done" })` per affected ticket, not a
  repeat of the automation.
- **ticket.setLabels**: `save_issue({ id, labels: [...] })` (full replace —
  read current labels first if only adding one).
- **ticket.comment**: `save_comment({ issueId: id, body })`.
  **listComments**: `list_comments({ issueId: id })`.
- **ticket.unassign**: `save_issue({ id, assigneeId: null })`. Reclaiming a
  dead worker's ticket needs this explicitly, alongside any state reset —
  resetting state alone while the retro-assign preference above left it
  assigned makes it fail the `assignee: null` filter and drop out of the
  frontier forever, silently, with no error.
- **order**: sort candidates by `priority` descending (Linear's native 1–4
  field), then `createdAt` ascending.
- **state.isClosed**: an issue's `state.type` is `completed` or `canceled`.
- **pr.referenceLines**: closing keyword `Closes: <PREFIX>-24, <PREFIX>-25,
  <PREFIX>-26` (one line, every ticket ID this wave completed, `<PREFIX>`
  this team's own key) in the PR body; `Refs: <PREFIX>-24` in a commit's
  trailer for a ticket touched but not finished by that commit. Verified
  against Linear's own docs:
  - **Closing** keywords (move the issue to the "on merge" status): `close`,
    `closes`, `closed`, `closing`, `fix`, `fixes`, `fixed`, `fixing`,
    `resolve`, `resolves`, `resolved`, `resolving`, `complete`, `completes`,
    `completed`, `completing`, `implement`, `implements`, `implemented`,
    `implementing`.
  - **Non-closing** keywords (link only, no status change on merge): `ref`,
    `refs`, `references`, `part of`, `contributes to`, `toward`, `towards`.
  - A single keyword line can cover multiple IDs and closes all of them —
    Linear's own canonical example: `Fixes ENG-123, DES-5, and ENG-256`.
    Linear's native PR automation applies to _every_ issue a PR references,
    not 1:1.
- **branch.nameFor**: `<branchPrefix>-<numeric suffix of the ticket id>-<slug>`
  — same derivation regardless of tracker.
