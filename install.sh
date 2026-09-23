#!/usr/bin/env bash
# Installs the global `forge` CLI, the `/forge` Claude Code command, and the
# forge-worker/forge-reviewer agents it dispatches.
# Safe to re-run — it overwrites its own previous install, nothing else.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required (https://bun.sh) — install it first." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "error: rsync is required (used to copy the CLI to ~/.claude/forge) — install it first." >&2
  exit 1
fi

echo "==> Copying the forge CLI to ~/.claude/forge"
mkdir -p "$HOME/.claude/forge"
rsync -a --delete --exclude node_modules "$SCRIPT_DIR/forge/" "$HOME/.claude/forge/"

echo "==> Copying the /forge command to ~/.claude/commands/forge.md"
mkdir -p "$HOME/.claude/commands"
cp "$SCRIPT_DIR/commands/forge.md" "$HOME/.claude/commands/forge.md"

echo "==> Copying the forge-worker and forge-reviewer agents to ~/.claude/agents/"
mkdir -p "$HOME/.claude/agents"
cp "$SCRIPT_DIR/agents/forge-worker.md" "$HOME/.claude/agents/forge-worker.md"
cp "$SCRIPT_DIR/agents/forge-reviewer.md" "$HOME/.claude/agents/forge-reviewer.md"

echo "==> Installing forge CLI dependencies"
(cd "$HOME/.claude/forge" && bun install --silent)

echo "==> Creating the forge wrapper at ~/.local/bin/forge"
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/forge" <<'EOF'
#!/usr/bin/env bash
exec bun "$HOME/.claude/forge/bin/forge.ts" "$@"
EOF
chmod +x "$HOME/.local/bin/forge"

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo
  echo "warning: $HOME/.local/bin is not on your PATH — add this to your shell profile:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo "==> Wiring the forge guard PreToolUse hook into ~/.claude/settings.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
GUARD_COMMAND="$HOME/.local/bin/forge guard"
if ! command -v jq >/dev/null 2>&1; then
  echo "warning: jq is required to wire the forge guard hook automatically — skipping." >&2
  echo "  Add this by hand to $SETTINGS_FILE's hooks.PreToolUse:" >&2
  echo "  {\"matcher\": \"Bash|ScheduleWakeup|Skill\", \"hooks\": [{\"type\": \"command\", \"command\": \"$GUARD_COMMAND\"}]}" >&2
elif [[ -f "$SETTINGS_FILE" ]] && jq -e --arg cmd "$GUARD_COMMAND" \
  'any(.hooks.PreToolUse[]?.hooks[]?; .command == $cmd)' "$SETTINGS_FILE" >/dev/null 2>&1; then
  echo "  already wired — leaving $SETTINGS_FILE untouched."
else
  mkdir -p "$HOME/.claude"
  [[ -f "$SETTINGS_FILE" ]] || echo '{}' > "$SETTINGS_FILE"
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.pre-forge-guard-backup"
  jq --arg cmd "$GUARD_COMMAND" \
    '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher": "Bash|ScheduleWakeup|Skill", "hooks": [{"type": "command", "command": $cmd}]}])' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "  added (backup at $SETTINGS_FILE.pre-forge-guard-backup)."
fi

echo
echo "Done. Verify with:"
echo "  forge selftest"
echo "  forge doctor ."
echo
echo "\`forge doctor\` also reports any recommended ~/.claude/settings.json"
echo "tweaks for running /forge unattended (model: opusplan, an unattended"
echo "permissions.defaultMode, deny rules for pushing to main/force) — see"
echo "the README's \"Models & effort\" section. It never edits that file."
echo
echo "Then, in any git repo, run \`forge init\` once and read what it prints —"
echo "it tells you about any missing dependency (the mattpocock-skills plugin,"
echo "gh, Linear) before you use /forge there."
