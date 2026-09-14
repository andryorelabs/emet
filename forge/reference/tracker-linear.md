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
- **ticket.read**: `get_issue({ id })`; `listComments({ issueId: id })` for
  its comments.
- **ticket.setState**: `save_issue({ id, state: "<name>" })`. The coordinator
  only calls this for a transition `tracker.transitions` marks `coordinator`
  — `onPrOpen`/`onPrMerge` are `automatic` here (Linear's own GitHub
  integration moves the issue to `In Review` on PR open and `Done` on
  merge); `onStart` is `worker` (`In Progress`, the worker's own first
  write).
- **ticket.setLabels**: `save_issue({ id, labels: [...] })` (full replace —
  read current labels first if only adding one).
- **ticket.comment**: `save_comment({ issueId: id, body })`.
  **listComments**: `list_comments({ issueId: id })`.
- **ticket.unassign**: `save_issue({ id, assigneeId: null })`.
- **order**: sort candidates by `priority` descending (Linear's native 1–4
  field), then `createdAt` ascending.
- **state.isClosed**: an issue's `state.type` is `completed` or `canceled`.
- **pr.referenceLines**: closing keyword `Closes: <PREFIX>-24, <PREFIX>-25,
  <PREFIX>-26` (one line, every ticket ID this wave completed, `<PREFIX>`
  this team's own key) in the PR body; `Refs: <PREFIX>-24` in a commit's
  trailer for a ticket touched but not finished by that commit.
- **branch.nameFor**: `<branchPrefix>-<numeric suffix of the ticket id>-<slug>`
  — same derivation regardless of tracker.
