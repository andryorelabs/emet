#!/usr/bin/env bash
# Installs the global `emet` CLI, the `/emet:run`, `/emet:init` and `/emet:doctor`
# Claude Code commands, and the emet-worker/emet-reviewer agents they dispatch.
# Safe to re-run — it records a SHA-256 manifest of what it installs and never
# overwrites a file you edited: the new version lands beside it as `<file>.new`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v bun >/dev/null 2>&1; then
  INSTALL_MODE="source"
else
  INSTALL_MODE="binary"
  echo "note: bun not found — installing the standalone-binary shim instead of the source CLI."
  if ! command -v curl >/dev/null 2>&1; then
    echo "error: curl is required to download the emet binary when bun is absent — install it first." >&2
    exit 1
  fi
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "error: rsync is required (used to stage the CLI copy) — install it first." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_COMMAND=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256_COMMAND=(shasum -a 256)
else
  echo "error: sha256sum or shasum is required (used for the install manifest) — install one first." >&2
  exit 1
fi

MANIFEST="$HOME/.claude/emet/.install-manifest.json"
LEGACY_DIR="$HOME/.claude/forge"
LEGACY_MANIFEST="$LEGACY_DIR/.install-manifest.json"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
STAGE="$WORK_DIR/stage"
ENTRIES_FILE="$WORK_DIR/entries.tsv"
KEPT_FILE="$WORK_DIR/kept.txt"
RETIRED_NOTES_FILE="$WORK_DIR/retired.txt"
LEGACY_KEPT_FILE="$WORK_DIR/legacy-kept.txt"
UNSHIPPED_KEPT_FILE="$WORK_DIR/unshipped-kept.txt"
: > "$UNSHIPPED_KEPT_FILE"
: > "$ENTRIES_FILE"
: > "$KEPT_FILE"
: > "$RETIRED_NOTES_FILE"
: > "$LEGACY_KEPT_FILE"

# Slash commands installed as ~/.claude/commands/emet/<name>.md, i.e. /emet:<name>.
COMMAND_NAMES=(run init doctor)

# Files a previous install shipped that emet no longer loads (split or renamed).
RETIRED_PATHS=(
  ".claude/forge/reference/phases-6-9.md"
)

is_retired() {
  local candidate="$1" retired_path
  for retired_path in "${RETIRED_PATHS[@]}"; do
    [[ "$candidate" == "$retired_path" ]] && return 0
  done
  return 1
}

rewrite_prompt() {
  sed \
    -e 's|[$]{CLAUDE_PLUGIN_ROOT}|$HOME/.claude|g' \
    -e 's|emet:emet-worker|emet-worker|g' \
    -e 's|emet:emet-reviewer|emet-reviewer|g' \
    -e 's|/forge:run|/forge|g' \
    -e 's|forge:forge-worker|forge-worker|g' \
    -e 's|forge:forge-reviewer|forge-reviewer|g' \
    "$1" > "$2"
}

for command_name in "${COMMAND_NAMES[@]}"; do
  if [[ ! -f "$SCRIPT_DIR/commands/$command_name.md" ]]; then
    echo "error: commands/$command_name.md is missing from $SCRIPT_DIR — the checkout is incomplete." >&2
    exit 1
  fi
done

echo "==> Staging the emet CLI, /emet:* commands, agents and wrapper"
mkdir -p "$STAGE/.claude/emet" "$STAGE/.claude/commands/emet" "$STAGE/.claude/agents" "$STAGE/.local/bin"
rsync -a --exclude node_modules "$SCRIPT_DIR/emet/" "$STAGE/.claude/emet/"
for reference_file in "$STAGE/.claude/emet/reference/"*.md; do
  [[ -e "$reference_file" ]] || continue
  rewrite_prompt "$reference_file" "$reference_file.rewritten"
  mv "$reference_file.rewritten" "$reference_file"
done
for command_name in "${COMMAND_NAMES[@]}"; do
  rewrite_prompt "$SCRIPT_DIR/commands/$command_name.md" "$STAGE/.claude/commands/emet/$command_name.md"
done
rewrite_prompt "$SCRIPT_DIR/agents/emet-worker.md" "$STAGE/.claude/agents/emet-worker.md"
rewrite_prompt "$SCRIPT_DIR/agents/emet-reviewer.md" "$STAGE/.claude/agents/emet-reviewer.md"
if [[ "$INSTALL_MODE" == "source" ]]; then
  cat > "$STAGE/.local/bin/emet" <<'WRAPPER'
#!/usr/bin/env bash
exec bun "$HOME/.claude/emet/bin/emet.ts" "$@"
WRAPPER
  chmod +x "$STAGE/.local/bin/emet"
else
  mkdir -p "$STAGE/.claude/emet/.claude-plugin"
  cp "$SCRIPT_DIR/bin/emet" "$STAGE/.claude/emet/bin/emet"
  cp "$SCRIPT_DIR/.claude-plugin/plugin.json" "$STAGE/.claude/emet/.claude-plugin/plugin.json"
  chmod +x "$STAGE/.claude/emet/bin/emet"
fi

file_hash() { "${SHA256_COMMAND[@]}" "$1" | cut -d' ' -f1; }

manifest_hash() {
  local manifest_file="${2:-$MANIFEST}"
  [[ -f "$manifest_file" ]] || return 0
  sed -n "s|^  \"$1\": \"\([0-9a-f]*\)\",\{0,1\}\$|\1|p" "$manifest_file"
}

manifest_paths() {
  sed -n 's|^  "\(.*\)": "[0-9a-f]*",\{0,1\}$|\1|p' "$1"
}

echo "==> Installing files (your edits are kept; new versions go to <file>.new)"
mkdir -p "$HOME/.claude/emet"
[[ -L "$HOME/.local/bin/emet" ]] && rm -f "$HOME/.local/bin/emet"

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
      elif ! is_retired "$previous_path"; then
        echo "$previous_path" >> "$UNSHIPPED_KEPT_FILE"
      fi
    fi
  done < <(manifest_paths "$MANIFEST")
fi

# Retired files are moved aside even when edited or untracked (pre-manifest
# installs), since a stale reference file would be loaded in place of its split.
for retired_path in "${RETIRED_PATHS[@]}"; do
  if [[ -f "$HOME/$retired_path" ]] && ! grep -qF -- "$retired_path"$'\t' "$ENTRIES_FILE"; then
    mv -f "$HOME/$retired_path" "$HOME/$retired_path.retired"
    rm -f "$HOME/$retired_path.new"
    echo "$retired_path (retired; your copy moved to ~/$retired_path.retired)" >> "$RETIRED_NOTES_FILE"
  fi
done

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
  echo "  Merge or delete the .new files; \`emet doctor\` keeps reporting the drift."
  echo
fi

if [[ -s "$UNSHIPPED_KEPT_FILE" ]]; then
  echo
  echo "note: these files are no longer shipped but were edited since the last install, so they were kept:"
  while IFS= read -r unshipped_kept; do
    echo "  - ~/$unshipped_kept"
  done < "$UNSHIPPED_KEPT_FILE"
  echo "  They may shadow or duplicate the new files; carry your edits over, then delete them."
  echo
fi

if [[ -s "$RETIRED_NOTES_FILE" ]]; then
  echo
  echo "note: these files are no longer shipped and were moved aside:"
  while IFS= read -r retired_note; do
    echo "  - ~/$retired_note"
  done < "$RETIRED_NOTES_FILE"
  echo "  Delete the .retired files once you no longer need them."
  echo
fi

# A legacy install (the CLI was called forge) is removed file by file from its
# own manifest: unmodified files go, edited ones stay and are listed.
if [[ -f "$LEGACY_MANIFEST" ]]; then
  echo "==> Removing the legacy forge install"
  while IFS= read -r legacy_path; do
    [[ -n "$legacy_path" && -f "$HOME/$legacy_path" ]] || continue
    if [[ "$(file_hash "$HOME/$legacy_path")" == "$(manifest_hash "$legacy_path" "$LEGACY_MANIFEST")" ]]; then
      rm -f "$HOME/$legacy_path" "$HOME/$legacy_path.new"
    else
      echo "$legacy_path" >> "$LEGACY_KEPT_FILE"
    fi
  done < <(manifest_paths "$LEGACY_MANIFEST")
  if [[ -L "$HOME/.local/bin/forge" && ! -e "$HOME/.local/bin/forge" ]]; then
    rm -f "$HOME/.local/bin/forge"
  fi
  if [[ ! -s "$LEGACY_KEPT_FILE" ]]; then
    rm -rf "$LEGACY_DIR/node_modules"
    rm -f "$LEGACY_DIR/bun.lock" "$LEGACY_MANIFEST"
  fi
  if [[ -d "$LEGACY_DIR" ]]; then
    find "$LEGACY_DIR" -depth -type d -empty -delete
  fi
  if [[ -s "$LEGACY_KEPT_FILE" ]]; then
    echo
    echo "note: these legacy forge files were edited since they were installed, so they were kept:"
    while IFS= read -r legacy_kept; do
      echo "  - ~/$legacy_kept"
    done < "$LEGACY_KEPT_FILE"
    echo "  emet no longer loads them; carry your edits over to the emet files, then delete them."
    echo
  fi
fi

if [[ "$INSTALL_MODE" == "source" ]]; then
  echo "==> Installing emet CLI dependencies"
  (cd "$HOME/.claude/emet" && bun install --silent)
else
  echo "==> Linking the emet shim into ~/.local/bin"
  mkdir -p "$HOME/.local/bin"
  ln -sf "$HOME/.claude/emet/bin/emet" "$HOME/.local/bin/emet"
fi

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo
  echo "warning: $HOME/.local/bin is not on your PATH — add this to your shell profile:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

SETTINGS_FILE="$HOME/.claude/settings.json"
GUARD_COMMAND="$HOME/.local/bin/emet guard"
BACKUPS_TO_KEEP=5
GUARD_MATCHER="Bash|ScheduleWakeup|Skill|Edit|Write|MultiEdit|NotebookEdit"

# Hook commands are rewritten from `forge guard` to `emet guard` in place;
# a group that becomes identical to an earlier one in its event is dropped.
LEGACY_GUARD_FILTER='
  def is_legacy_guard: type == "string" and test("^(\\S*/)?forge guard( |$)");
  def rename_hook: if (.command? | is_legacy_guard) then .command |= sub("^(?<prefix>(\\S*/)?)forge guard"; "\(.prefix)emet guard") else . end;
  def rename_group: if (.hooks? | type) == "array" then .hooks |= map(rename_hook) else . end;
  def drop_duplicates: reduce .[] as $group ([]; if any(.[]; . == $group) then . else . + [$group] end);
  if (.hooks? | type) == "object" then
    .hooks |= with_entries(if (.value | type) == "array" then .value |= (map(rename_group) | drop_duplicates) else . end)
  else . end'
if [[ -f "$SETTINGS_FILE" ]] && command -v jq >/dev/null 2>&1 && jq -e \
  'any(.hooks[]?[]?.hooks[]?; .command? | type == "string" and test("^(\\S*/)?forge guard( |$)"))' \
  "$SETTINGS_FILE" >/dev/null 2>&1; then
  echo "==> Renaming the forge guard hooks in ~/.claude/settings.json to emet guard"
  LEGACY_BACKUP_FILE="$SETTINGS_FILE.pre-emet-guard-backup.$(date -u +%Y%m%dT%H%M%SZ).legacy"
  cp "$SETTINGS_FILE" "$LEGACY_BACKUP_FILE"
  if ! jq "$LEGACY_GUARD_FILTER" "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"; then
    echo "error: could not rewrite the forge guard hooks; settings.json is unchanged (backup at $LEGACY_BACKUP_FILE)." >&2
    exit 1
  fi
  mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "  renamed (backup at $LEGACY_BACKUP_FILE)."
fi

echo "==> Wiring the emet guard PreToolUse hook into ~/.claude/settings.json"
if ! command -v jq >/dev/null 2>&1; then
  echo "warning: jq is required to wire the emet guard hook automatically — skipping." >&2
  echo "  Add this by hand to $SETTINGS_FILE's hooks.PreToolUse:" >&2
  echo "  {\"matcher\": \"Bash|ScheduleWakeup|Skill|Edit|Write|MultiEdit|NotebookEdit\", \"hooks\": [{\"type\": \"command\", \"command\": \"$GUARD_COMMAND\"}]}" >&2
elif [[ -f "$SETTINGS_FILE" ]] && jq -e --arg cmd "$GUARD_COMMAND" \
  'any(.hooks.PreToolUse[]?.hooks[]?; .command == $cmd)' "$SETTINGS_FILE" >/dev/null 2>&1; then
  if jq -e --arg cmd "$GUARD_COMMAND" --arg matcher "$GUARD_MATCHER" \
    'any(.hooks.PreToolUse[]?; .matcher != $matcher and any(.hooks[]?; .command == $cmd))' "$SETTINGS_FILE" >/dev/null 2>&1; then
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.pre-emet-guard-backup.$(date -u +%Y%m%dT%H%M%SZ)"
    jq --arg cmd "$GUARD_COMMAND" --arg matcher "$GUARD_MATCHER" \
      '(.hooks.PreToolUse[] | select(any(.hooks[]?; .command == $cmd))).matcher = $matcher' \
      "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "  PreToolUse matcher widened to cover Edit/Write."
  else
    echo "  PreToolUse already wired."
  fi
else
  mkdir -p "$HOME/.claude"
  [[ -f "$SETTINGS_FILE" ]] || echo '{}' > "$SETTINGS_FILE"
  BACKUP_FILE="$SETTINGS_FILE.pre-emet-guard-backup.$(date -u +%Y%m%dT%H%M%SZ)"
  cp "$SETTINGS_FILE" "$BACKUP_FILE"
  jq --arg cmd "$GUARD_COMMAND" --arg matcher "$GUARD_MATCHER" \
    '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher": $matcher, "hooks": [{"type": "command", "command": $cmd}]}])' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "  added (backup at $BACKUP_FILE)."
  # Timestamps sort lexicographically; drop everything but the newest few.
  # shellcheck disable=SC2012
  ls -1 "$SETTINGS_FILE".pre-emet-guard-backup.* 2>/dev/null | sort -r | tail -n +"$((BACKUPS_TO_KEEP + 1))" | while IFS= read -r stale_backup; do
    rm -f -- "$stale_backup"
  done
fi

echo "==> Wiring the emet guard SubagentStop and Stop hooks"
if command -v jq >/dev/null 2>&1; then
  for STOP_EVENT in SubagentStop Stop; do
    STOP_COMMAND="$GUARD_COMMAND --event $STOP_EVENT"
    if [[ -f "$SETTINGS_FILE" ]] && jq -e --arg event "$STOP_EVENT" --arg cmd "$STOP_COMMAND" \
      'any(.hooks[$event][]?.hooks[]?; .command == $cmd)' "$SETTINGS_FILE" >/dev/null 2>&1; then
      echo "  $STOP_EVENT already wired."
    else
      mkdir -p "$HOME/.claude"
      [[ -f "$SETTINGS_FILE" ]] || echo '{}' > "$SETTINGS_FILE"
      cp "$SETTINGS_FILE" "$SETTINGS_FILE.pre-emet-guard-backup.$(date -u +%Y%m%dT%H%M%SZ)"
      jq --arg event "$STOP_EVENT" --arg cmd "$STOP_COMMAND" \
        '.hooks[$event] = ((.hooks[$event] // []) + [{"hooks": [{"type": "command", "command": $cmd}]}])' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "  $STOP_EVENT added."
    fi
  done
  # shellcheck disable=SC2012
  ls -1 "$SETTINGS_FILE".pre-emet-guard-backup.* 2>/dev/null | sort -r | tail -n +"$((BACKUPS_TO_KEEP + 1))" | while IFS= read -r stale_backup; do
    rm -f -- "$stale_backup"
  done
else
  echo "warning: jq is required to wire the SubagentStop/Stop hooks automatically — skipping." >&2
  echo "  Add {\"hooks\": [{\"type\": \"command\", \"command\": \"$GUARD_COMMAND --event SubagentStop\"}]} to hooks.SubagentStop" >&2
  echo "  and the same with --event Stop to hooks.Stop in $SETTINGS_FILE." >&2
fi

echo
echo "Done. Verify with:"
if [[ "$INSTALL_MODE" == "source" ]]; then
  echo "  emet selftest"
fi
echo "  emet doctor ."
echo
echo "\`emet doctor\` also reports any recommended ~/.claude/settings.json"
echo "tweaks for running /emet:run unattended (model: opusplan, an unattended"
echo "permissions.defaultMode, deny rules for pushing to main/force) — see"
echo "the README's \"Models & effort\" section. It never edits that file."
echo
echo "Recommended order: run /setup-matt-pocock-skills in the repo first, then"
echo "run \`emet init\` once and read what it prints —"
echo "it tells you about any missing dependency (the mattpocock-skills plugin,"
echo "gh, Linear) before you use /emet:run there."
