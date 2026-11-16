#!/usr/bin/env bash
# Prints a JSON map of repository path -> last commit date (YYYY-MM-DD) for the
# sources the sitemap stamps with lastmod. The image build has no git history,
# so callers pass this output as the LAST_MODIFIED_DATES build argument:
#   docker build --build-arg LAST_MODIFIED_DATES="$(bash apps/site/docker/last-modified.sh)" ...
# The roots match LAST_MODIFIED_ROOTS in src/seo/last-modified.ts.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
if [ "$(git -C "$root" rev-parse --is-shallow-repository)" = true ]; then
  echo "Shallow clone: every date would equal the latest commit. Fetch full history (fetch-depth: 0)." >&2
  exit 1
fi

roots=(
  docs
  CHANGELOG.md
  apps/site/src/content/translations
  apps/site/src/components/home
  apps/site/src/pages/index.astro
  "apps/site/src/pages/[locale]/index.astro"
  apps/site/src/i18n/ui
)

cd "$root"
git ls-files -z -- "${roots[@]/#/:(literal)}" | while IFS= read -r -d '' file; do
  case "$file" in *.test.*) continue ;; esac
  printf '%s\t%s\n' "$file" "$(git log -1 --format=%cs -- ":(literal)$file")"
done | jq -Rsc 'split("\n") | map(select(length > 0) | split("\t") | select(.[1] != "") | {(.[0]): .[1]}) | add // {}'
