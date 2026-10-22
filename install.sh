#!/usr/bin/env bash
# Installs the global `forge` CLI, the `/forge` Claude Code command, and the
# forge-worker/forge-reviewer agents it dispatches.
# Safe to re-run — it records a SHA-256 manifest of what it installs and never
# overwrites a file you edited: the new version lands beside it as `<file>.new`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required (https://bun.sh) — install it first." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "error: rsync is required (used to stage the CLI copy) — install it first." >&2
  exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "error: sha256sum is required (used for the install manifest) — install it first." >&2
  exit 1
fi

MANIFEST="$HOME/.claude/forge/.install-manifest.json"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
STAGE="$WORK_DIR/stage"
ENTRIES_FILE="$WORK_DIR/entries.tsv"
KEPT_FILE="$WORK_DIR/kept.txt"
: > "$ENTRIES_FILE"
: > "$KEPT_FILE"

echo "==> Staging the forge CLI, /forge command, agents and wrapper"
mkdir -p "$STAGE/.claude/forge" "$STAGE/.claude/commands" "$STAGE/.claude/agents" "$STAGE/.local/bin"
rsync -a --exclude node_modules "$SCRIPT_DIR/forge/" "$STAGE/.claude/forge/"
cp "$SCRIPT_DIR/commands/forge.md" "$STAGE/.claude/commands/forge.md"
cp "$SCRIPT_DIR/agents/forge-worker.md" "$STAGE/.claude/agents/forge-worker.md"
cp "$SCRIPT_DIR/agents/forge-reviewer.md" "$STAGE/.claude/agents/forge-reviewer.md"
cat > "$STAGE/.local/bin/forge" <<'WRAPPER'
#!/usr/bin/env bash
exec bun "$HOME/.claude/forge/bin/forge.ts" "$@"
WRAPPER
chmod +x "$STAGE/.local/bin/forge"

file_hash() { sha256sum "$1" | cut -d' ' -f1; }

manifest_hash() {
  [[ -f "$MANIFEST" ]] || return 0
  sed -n "s|^  \"$1\": \"\([0-9a-f]*\)\",\{0,1\}\$|\1|p" "$MANIFEST"
}

echo "==> Installing files (your edits are kept; new versions go to <file>.new)"
mkdir -p "$HOME/.claude/forge"

while IFS= read -r -d '' staged_file; do
  relative_path="${staged_file#"$STAGE"/}"
  destination="$HOME/$relative_path"
  new_hash="$(file_hash "$staged_file")"
  recorded_hash="$(manifest_hash "$relative_path")"
  recorded_entry="$new_hash"

  mkdir -p "$(dirname "$destination")"
  if [[ ! -e "$destination" ]]; then
    cp -p "$staged_file" "$destination"
  else
    current_hash="$(file_hash "$destination")"
    if [[ "$current_hash" == "$new_hash" ]]; then
      rm -f "$destination.new"
    elif [[ -n "$recorded_hash" && "$current_hash" != "$recorded_hash" ]]; then
      cp -p "$staged_file" "$destination.new"
      recorded_entry="$recorded_hash"
      echo "$relative_path" >> "$KEPT_FILE"
    else
      cp -p "$staged_file" "$destination"
      rm -f "$destination.new"
    fi
  fi
  printf '%s\t%s\n' "$relative_path" "$recorded_entry" >> "$ENTRIES_FILE"
done < <(find "$STAGE" -type f -print0)

if [[ -f "$MANIFEST" ]]; then
  while IFS= read -r previous_path; do
    [[ -n "$previous_path" ]] || continue
    if ! grep -qF -- "$previous_path"$'\t' "$ENTRIES_FILE" && [[ -f "$HOME/$previous_path" ]]; then
      if [[ "$(file_hash "$HOME/$previous_path")" == "$(manifest_hash "$previous_path")" ]]; then
        rm -f "$HOME/$previous_path" "$HOME/$previous_path.new"
      else
        echo "$previous_path (no longer shipped, left in place)" >> "$KEPT_FILE"
      fi
    fi
  done < <(sed -n 's|^  "\(.*\)": "[0-9a-f]*",\{0,1\}$|\1|p' "$MANIFEST")
fi

{
  echo "{"
  LC_ALL=C sort "$ENTRIES_FILE" | awk -F'\t' '{ lines[NR] = "  \"" $1 "\": \"" $2 "\"" } END { for (i = 1; i <= NR; i++) print lines[i] (i < NR ? "," : "") }'
  echo "}"
} > "$MANIFEST.tmp"
mv "$MANIFEST.tmp" "$MANIFEST"

if [[ -s "$KEPT_FILE" ]]; then
  echo
  echo "note: these files were edited since the last install, so your version was kept:"
  while IFS= read -r kept; do
    echo "  - ~/$kept  (new version written to ~/$kept.new)"
  done < "$KEPT_FILE"
  echo "  Merge or delete the .new files; \`forge doctor\` keeps reporting the drift."
  echo
fi

echo "==> Installing forge CLI dependencies"
(cd "$HOME/.claude/forge" && bun install --silent)

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo
  echo "warning: $HOME/.local/bin is not on your PATH — add this to your shell profile:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo "==> Wiring the forge guard PreToolUse hook into ~/.claude/settings.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
GUARD_COMMAND="$HOME/.local/bin/forge guard"
BACKUPS_TO_KEEP=5
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
  BACKUP_FILE="$SETTINGS_FILE.pre-forge-guard-backup.$(date -u +%Y%m%dT%H%M%SZ)"
  cp "$SETTINGS_FILE" "$BACKUP_FILE"
  jq --arg cmd "$GUARD_COMMAND" \
    '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher": "Bash|ScheduleWakeup|Skill", "hooks": [{"type": "command", "command": $cmd}]}])' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "  added (backup at $BACKUP_FILE)."
  # Timestamps sort lexicographically; drop everything but the newest few.
  # shellcheck disable=SC2012
  ls -1 "$SETTINGS_FILE".pre-forge-guard-backup.* 2>/dev/null | sort -r | tail -n +"$((BACKUPS_TO_KEEP + 1))" | while IFS= read -r stale_backup; do
    rm -f -- "$stale_backup"
  done
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
