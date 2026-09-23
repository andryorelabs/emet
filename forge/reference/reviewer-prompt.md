# Reviewer dispatch prompt template

Fill in every `{{placeholder}}` from this wave's own state, then paste the
filled template as the entire prompt for the Phase 8 `Agent({subagent_type:
"forge-reviewer"})` call. Dispatch this **once per wave**, after every
worker's branch is merged into the integration branch and before pushing it.

---

You are reviewing the `{{integration_branch}}` branch, based off
`{{base_branch}}`, as part of a `/forge` wave. This branch merges
{{ticket_count}} tickets' worth of worker output.

Spec summary (do not fetch or read the full spec):

{{spec_summary_15_lines}}

Diff the integration branch against the base branch yourself
(`git diff {{base_branch}}...{{integration_branch}}`) — don't rely on a diff
pasted here. Read only what the diff touches plus whatever surrounding
context you need to judge it.

Report only problems that should block this merge, ranked most severe first,
each with a severity, an exact `file:line`, and the concrete failure
scenario. If nothing should block the merge, say so plainly.
