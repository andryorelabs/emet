#!/usr/bin/env bash
# Runs Lighthouse (desktop preset) three times on each of the Website's key pages
# and fails when the median of a category score or a metric breaks the budget.
# Usage: bash apps/site/scripts/lighthouse-budget.sh <base-url> [report-dir]
# Chrome comes from CHROME_PATH, or else from Playwright's Chromium install.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: lighthouse-budget.sh <base-url> [report-dir]" >&2
  exit 2
fi
base="${1%/}"
reports="${2:-e2e/.output/lighthouse}"
site_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lighthouse_version="13.6.0"
pages=(/ /docs/guide/getting-started/ /es/)
# Runs per page; the budget applies to the median, which absorbs one noisy run.
runs=3

# Minimum category scores, 0 to 1.
min_performance=0.9
min_accessibility=0.9
min_best_practices=0.95
min_seo=0.9
# Maximum metric values.
max_lcp_ms=2500
max_cls=0.1
max_tbt_ms=200
max_total_kib=1024

# Per-page budgets for known Website defects pending a follow-up ticket, keyed
# "<page>|<budget>". Delete an entry once its defect is fixed.
declare -A known_defects=(
  # The style-src-attr CSP console errors cost 0.08 of best-practices.
  ["/|min_best_practices"]=0.9
  ["/es/|min_best_practices"]=0.9
  # The docs content container shifts after load (CLS up to 0.3).
  ["/docs/guide/getting-started/|max_cls"]=0.35
  ["/docs/guide/getting-started/|min_performance"]=0.8
)

# budget <page> <name>: the page's known-defect budget, else the default one.
budget() { echo "${known_defects["$1|$2"]:-${!2}}"; }

if [ -z "${CHROME_PATH:-}" ]; then
  CHROME_PATH="$(cd "$site_dir" && bun -e 'console.log(require("@playwright/test").chromium.executablePath())')"
  export CHROME_PATH
fi
mkdir -p "$reports"

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# below <value> <minimum>: true when value < minimum.
below() { awk -v value="$1" -v minimum="$2" 'BEGIN { exit !(value < minimum) }'; }

# run_lighthouse <url> <report> <page> <run>: one Lighthouse run, retried up to
# max_attempts times when it fails at runtime (non-zero exit, no report or a
# report with a runtimeError). A budget breach is not a runtime error.
max_attempts=3
run_lighthouse() {
  local url="$1" report="$2" page="$3" run="$4" attempt
  for attempt in $(seq 1 "$max_attempts"); do
    rm -f "$report"
    if bun x "lighthouse@$lighthouse_version" "$url" --quiet --preset=desktop \
      --only-categories=performance,accessibility,best-practices,seo \
      --chrome-flags="--headless=new --no-sandbox" \
      --output=json --output-path="$report" &&
      [ -s "$report" ] && ! jq -e '.runtimeError' "$report" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      echo "retrying $page run $run (attempt $attempt of $max_attempts failed)" >&2
    fi
  done
  echo "FAIL: $page run $run failed after $max_attempts attempts" >&2
  return 1
}

for page in "${pages[@]}"; do
  slug="$(tr -c 'a-z0-9\n' '-' <<<"$page" | sed 's/^-*//; s/-*$//')"
  run_reports=()
  for run in $(seq 1 "$runs"); do
    report="$reports/${slug:-home}-$run.json"
    run_lighthouse "$base$page" "$report" "$page" "$run" || exit 1
    run_reports+=("$report")
  done

  # The median of each value across the runs.
  read -r performance accessibility best_practices seo lcp cls tbt total < <(jq -rs '
    map([
      .categories.performance.score, .categories.accessibility.score,
      .categories["best-practices"].score, .categories.seo.score,
      .audits["largest-contentful-paint"].numericValue,
      .audits["cumulative-layout-shift"].numericValue,
      .audits["total-blocking-time"].numericValue,
      (.audits["total-byte-weight"].numericValue / 1024)
    ]) | transpose | map(sort | .[length / 2 | floor]) | map(tostring) | join(" ")' "${run_reports[@]}")
  echo "$page: performance $performance, accessibility $accessibility, best-practices $best_practices, seo $seo, LCP ${lcp}ms, CLS $cls, TBT ${tbt}ms, ${total}KiB"

  limit="$(budget "$page" min_performance)"
  below "$performance" "$limit" && fail "$page performance $performance < $limit"
  limit="$(budget "$page" min_accessibility)"
  below "$accessibility" "$limit" && fail "$page accessibility $accessibility < $limit"
  limit="$(budget "$page" min_best_practices)"
  below "$best_practices" "$limit" && fail "$page best-practices $best_practices < $limit"
  limit="$(budget "$page" min_seo)"
  below "$seo" "$limit" && fail "$page seo $seo < $limit"
  limit="$(budget "$page" max_lcp_ms)"
  below "$limit" "$lcp" && fail "$page LCP ${lcp}ms > ${limit}ms"
  limit="$(budget "$page" max_cls)"
  below "$limit" "$cls" && fail "$page CLS $cls > $limit"
  limit="$(budget "$page" max_tbt_ms)"
  below "$limit" "$tbt" && fail "$page TBT ${tbt}ms > ${limit}ms"
  limit="$(budget "$page" max_total_kib)"
  below "$limit" "$total" && fail "$page weighs ${total}KiB > ${limit}KiB"
done

if [ "$failures" -gt 0 ]; then
  echo "$failures Lighthouse budget check(s) failed" >&2
  exit 1
fi
echo "OK"
