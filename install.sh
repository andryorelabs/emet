#!/usr/bin/env bash
# Installs the global `forge` CLI + the `/forge` Claude Code command.
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

echo
echo "Done. Verify with:"
echo "  forge selftest"
echo
echo "Then, in any git repo, run \`forge init\` once and read what it prints —"
echo "it tells you about any missing dependency (the mattpocock-skills plugin,"
echo "gh, Linear) before you use /forge there."
