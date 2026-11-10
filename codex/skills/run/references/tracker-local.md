# Tracker: local — literal calls

The literal `emet tracker` calls behind the abstract ops. Files live in the
main worktree's `.scratch/<spec-slug>/` (`spec.md`, `issues/<NN>-<slug>.md`),
whichever worktree calls; `.scratch/` is not versioned. Every call prints
JSON; exit 0 ok, 1 not found or refused, 2 usage. Body arguments are files.
Ids: a spec id is its slug, a ticket id is `<slug>-<NN>`.

- **spec.create**: `emet tracker create-spec --slug <slug> --title <t>
  --body-file <f>`.
- **ticket.create**: `emet tracker create-ticket --spec <slug> --title <t>
  --body-file <f> [--blocked-by NN,NN]` — assigns the next `NN`, writes
  `Status: ready-for-agent`.
- **frontier.candidates**: `emet tracker frontier --spec <slug>` — tickets
  `ready-for-agent` whose blockers are all `done`, ordered by `NN`.
- **ticket.read**: `emet tracker read <id>` (title, status, blockedBy, body,
  comments). **listComments**: the `comments` field of the same call.
- **ticket.setState**: `emet tracker set-state <id> <status>` — `in-progress`
  at dispatch, `in-review` when the wave lands for review; statuses outside
  the vocabulary exit 2.
- **ticket.comment**: `emet tracker comment <id> --body-file <f>`.
- **state.isClosed**: `status` is `done`, `canceled` or `resolved`. Close with
  `emet tracker close <id> [--canceled]`; the last close sets the spec `done`.
- **branch.nameFor**: `<branchPrefix>-<ticket id>-<title slug>`.
- **pr.referenceLines**: `Refs: <ticket id>` trailer; no closing keyword,
  the coordinator closes tickets after `emet land`.

Only the coordinator writes tracker state (`transitions` are all
`coordinator`); workers may call `emet tracker read`/`frontier` only and
report through `emet results`.
