#!/bin/sh
# Installs emet: curl -fsSL https://emet.andryore.dev/install.sh | sh
# Published with each release as the install.sh asset. Downloads this
# platform's binary and SHA256SUMS into a temporary directory, verifies the
# checksum (and the build provenance attestation when a signed-in gh is on
# PATH), and only then runs `<tmp>/emet self install "$@"`. Arguments are passed
# through: [latest|X.Y.Z] [--dry-run] [--from <dir>] [--force].
# EMET_RELEASE_BASE_URL overrides the download root, as in bin/emet: assets are
# read from <root>/vX.Y.Z for a pinned version and from <root>/latest otherwise.
# Without it, GitHub release URLs are used.
# The body lives in main(), called on the last line, so a partially downloaded
# script runs nothing.

set -u

repository=andryorelabs/emet

fail() {
  echo "emet install: $1" >&2
  exit 1
}

note() {
  echo "emet install: $1" >&2
}

refuse_privileged() {
  if [ -n "${SUDO_USER:-}${SUDO_UID:-}" ] || [ "$(id -u 2>/dev/null)" = 0 ]; then
    fail "do not run the installer with sudo or as root; emet installs into your home directory. Rerun it as your own user."
  fi
}

detect_os() {
  platform_os=$(uname -s 2>/dev/null) || platform_os=unknown
  case $platform_os in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    MINGW* | MSYS* | CYGWIN*) fail "native Windows is not supported; run the installer inside WSL." ;;
    *) fail "unsupported operating system $platform_os; emet supports Linux and macOS." ;;
  esac
}

detect_arch() {
  platform_arch=$(uname -m 2>/dev/null) || platform_arch=unknown
  case $platform_arch in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "unsupported architecture $platform_arch; emet supports x64 and arm64." ;;
  esac
  if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
    arch=arm64
  fi
}

refuse_musl() {
  [ "$os" = linux ] || return 0
  for loader in /lib/ld-musl-*; do
    [ -e "$loader" ] && fail "musl libc (for example Alpine) is not supported; emet's Linux binaries need glibc."
  done
  if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
    fail "musl libc (for example Alpine) is not supported; emet's Linux binaries need glibc."
  fi
}

requested_version() {
  skip_next=0
  for argument in "$@"; do
    if [ "$skip_next" = 1 ]; then
      skip_next=0
      continue
    fi
    case $argument in
      --from) skip_next=1 ;;
      [0-9]*.[0-9]*.[0-9]*)
        echo "$argument"
        return 0
        ;;
    esac
  done
}

resolve_release_url() {
  version=$(requested_version "$@")
  if [ -n "${EMET_RELEASE_BASE_URL:-}" ]; then
    if [ -n "$version" ]; then
      release_url="$EMET_RELEASE_BASE_URL/v$version"
    else
      release_url="$EMET_RELEASE_BASE_URL/latest"
    fi
  elif [ -n "$version" ]; then
    release_url="https://github.com/$repository/releases/download/v$version"
  else
    release_url="https://github.com/$repository/releases/latest/download"
  fi
}

choose_checksum_command() {
  if command -v sha256sum >/dev/null 2>&1; then
    checksum_command="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    checksum_command="shasum -a 256"
  else
    fail "no sha256sum or shasum available to verify the download"
  fi
}

download() {
  curl -fsSL --proto '=https,file' --proto-redir '=https' --connect-timeout 15 \
    --speed-limit 1024 --speed-time 30 "$1" -o "$2"
}

verify_checksum() {
  expected=$(awk -v name="$asset" '{ file = $2; sub(/^\*/, "", file); if (file == name) { print $1; exit } }' "$staging/SHA256SUMS")
  [ -n "$expected" ] || fail "no checksum listed for $asset in SHA256SUMS; nothing was installed."
  actual=$($checksum_command "$staging/emet" | awk '{ print $1 }')
  [ "$actual" = "$expected" ] || fail "checksum mismatch for $asset (the download may be truncated or tampered with); nothing was installed."
}

verify_attestation() {
  if ! command -v gh >/dev/null 2>&1; then
    note "gh not found; skipping the build provenance check (the checksum verified)."
    return 0
  fi
  if ! gh auth status >/dev/null 2>&1; then
    note "gh is not signed in; skipping the build provenance check (the checksum verified)."
    return 0
  fi
  gh attestation verify "$staging/emet" --repo "$repository" >/dev/null ||
    fail "the build provenance attestation of $asset did not verify; nothing was installed."
}

main() {
  refuse_privileged
  detect_os
  detect_arch
  refuse_musl
  command -v curl >/dev/null 2>&1 || fail "curl is required to download emet"
  choose_checksum_command
  resolve_release_url "$@"
  asset="emet-$os-$arch"

  staging=$(mktemp -d "${TMPDIR:-/tmp}/emet-install.XXXXXX") || fail "cannot create a temporary directory"
  trap 'rm -rf "$staging"' EXIT
  trap 'exit 1' HUP INT TERM

  download "$release_url/$asset" "$staging/emet" || fail "could not download $asset from $release_url"
  download "$release_url/SHA256SUMS" "$staging/SHA256SUMS" || fail "could not download SHA256SUMS from $release_url"
  verify_checksum
  verify_attestation
  chmod +x "$staging/emet" || fail "cannot mark the downloaded emet executable"

  "$staging/emet" self install "$@"
  exit $?
}

main "$@"
