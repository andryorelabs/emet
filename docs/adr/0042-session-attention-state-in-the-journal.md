# 0042. Session attention state in the journal

Status: Accepted (2026-11-22)
Spec: draft #798

## Context

`emet status` reports waves, not whether a session is waiting for a person, so a session blocked on a permission prompt or a question goes unnoticed until someone looks. Claude Code announces that state through hooks, and `emet guard` is already wired to several of them.

## Decision

The guard records each **Attention state** transition of an emet-owned session as the **Journal** kind `session.attention`, extending the kind list of [0030](0030-global-event-journal.md).

- **States.** `working`, `needs-decision`, `idle` and `ended`; "blocked" is another word for `needs-decision`. `PermissionRequest`, and `Notification` of type `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` or `agent_needs_input`, give `needs-decision`; `Notification` `idle_prompt` and `Stop` give `idle`; `UserPromptSubmit` and `PreToolUse` give `working`; `SessionEnd` gives `ended`. Codex has none of the notification events, so there `Stop` gives `idle` unless the run has a `BLOCKED` or `NEEDS_CONTEXT` result, which gives `needs-decision`.
- **Append on change.** The last state of a session is found by scanning the tail of the current journal segment; an event is appended only when the state differs. There is no second store.
- **Per session.** The state belongs to the session named by the hook's `session_id`, not to a worker.
- **emet-owned sessions only.** A session counts when its `cwd` is in an emet worker worktree, or in a repo with an emet config and a run that has not finished.
- **Nothing from the hook input is recorded.** The event holds the session id, the two states, the trigger name and the run id; never the notification `message` or `title`, the tool name or the tool input.
- **Never blocking.** Recording failures are swallowed, and `PermissionRequest`, `Notification` and `SessionEnd` print nothing, so a permission dialog is unchanged.
- **Alert.** Entering `needs-decision` raises one alert: an Orca unread comment on the worktree when the Orca runtime is reachable, else `notify-send` when it exists. The alert is never cleared by emet and can be turned off with `attention.alert`.
- `emet status` reads the events as `sessions[]`, and `emet fleet status` reads them across repos.

## Consequences

- A blocked session raises the overall `emet status` state to `needs-decision` even with no wave running.
- Each hook start costs one bun process; `PreToolUse` and `Stop` were already wired, so only the four new events add starts.
- The journal grows by at most one event per state change of a session.
- `PermissionRequest` is used for `needs-decision` because `Notification` of type `permission_prompt` arrives about six seconds late.
- The resume to `working` comes with the next `PreToolUse` or `UserPromptSubmit`, not at the moment a permission is granted.

## Alternatives considered

- **A state file per session**: rejected because it is a second store that ADR 0030 avoids and that no command reads across repos.
- **`PostToolUse` to mark the resume**: rejected because it starts bun once per tool call.
- **`Notification` alone**: rejected because the permission prompt reaches it about six seconds late.
