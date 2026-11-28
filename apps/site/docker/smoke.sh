#!/usr/bin/env bash
# Builds the Website image from the repo root, runs it, and checks pages,
# redirects, the 404, security headers, the well-known public files and masked
# logs. Not part of `bun run check`: run it by hand or from deploy-site.yml.
# LAST_MODIFIED_DATES (the output of last-modified.sh), when set, is passed to
# the build and the sitemap must then carry lastmod dates.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
image="emet-site-smoke"
name="emet-site-smoke-$$"

docker build -f "$root/apps/site/Dockerfile" \
  --build-arg LAST_MODIFIED_DATES="${LAST_MODIFIED_DATES:-}" -t "$image" "$root"
docker run -d --rm --name "$name" -p 127.0.0.1:0:80 "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
port="$(docker port "$name" 80/tcp | head -n1 | sed 's/.*://')"
base="http://127.0.0.1:$port"

for _ in $(seq 1 30); do
  curl -fs -o /dev/null "$base/" && break
  sleep 0.5
done

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

status() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
location() { curl -s -o /dev/null -D - "$1" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'; }
header_of() { curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' "$2" | tr -d '\r' | awk -v name="$1:" 'tolower($1)==name{sub(/^[^ ]+ /,""); print}'; }

for path in / /es/; do
  [ "$(status "$base$path")" = 200 ] || fail "$path is not 200"
done
for path in /nope/ /es/nope/ /docs/nope/; do
  [ "$(status "$base$path")" = 404 ] || fail "$path is not 404"
done
grep -q '<html' <<<"$(curl -s "$base/nope/")" || fail "the 404 has no page body"
[ "$(header_of cache-control "$base/nope/")" = no-cache ] || fail "the 404 lacks no-cache"
grep -q '<html[^>]*lang="en"' <<<"$(curl -s "$base/nope/")" || fail "/nope/ is not the English 404"
for pair in es:es de:de fr:fr it:it ja:ja ko:ko pt-br:pt-BR ru:ru zh-cn:zh-CN; do
  segment="${pair%%:*}"
  lang="${pair##*:}"
  [ "$(status "$base/$segment/nope/")" = 404 ] || fail "/$segment/nope/ is not 404"
  grep -q "<html[^>]*lang=\"$lang\"" <<<"$(curl -s "$base/$segment/nope/")" || fail "/$segment/nope/ is not the $lang 404"
done
[ "$(status "$base/sitemap-index.xml")" = 404 ] || fail "Starlight's sitemap index is built"
[ "$(curl -s "$base/docs/start/install/" | grep -o 'rel="sitemap"[^>]*' | wc -l)" = 1 ] || fail "the docs head does not name exactly one sitemap"
grep -q 'rel="sitemap"[^>]*href="/sitemap.xml"' <<<"$(curl -s "$base/docs/start/install/")" || fail "the docs head does not name /sitemap.xml"
[ "$(status "$base/es/404/")" = 200 ] || fail "/es/404/ is not 200"
[ "$(header_of cache-control "$base/es/nope/")" = no-cache ] || fail "the locale 404 lacks no-cache"

for pair in "/es:/es/" "/docs:/docs/" "/docs/:/docs/start/overview/" "/es/docs/:/es/docs/start/overview/" "/index.html:/" "/es/index.html:/es/" "/pt-BR/:/pt-br/" "/zh_CN/:/zh-cn/"; do
  from="${pair%%:*}"
  to="${pair##*:}"
  [ "$(status "$base$from")" = 301 ] || fail "$from is not 301"
  [ "$(location "$base$from")" = "$to" ] || fail "$from does not redirect to $to"
done
for old_route in /docs/guide/getting-started/ /es/docs/guide/codex/ /docs/architecture/; do
  [ "$(status "$base$old_route")" != 404 ] || fail "the old route $old_route is 404"
done
for pair in "/docs/guide/getting-started.md:/docs/start/install.md" "/es/docs/guide/fleet.md:/es/docs/how-to/check-a-fleet.md" "/docs/guide/codex/:/docs/how-to/use-codex/"; do
  from="${pair%%:*}"
  to="${pair##*:}"
  [ "$(status "$base$from")" = 301 ] || fail "the old route $from is not 301"
  [ "$(location "$base$from")" = "$to" ] || fail "the old route $from does not redirect to $to"
done
[ "$(location "$base/es?a=1")" = "/es/?a=1" ] || fail "the trailing-slash redirect drops the query string"
install_script_url="https://github.com/andryorelabs/emet/releases/latest/download/install.sh"
[ "$(status "$base/install.sh")" = 302 ] || fail "/install.sh is not 302"
[ "$(location "$base/install.sh")" = "$install_script_url" ] || fail "/install.sh does not redirect to $install_script_url"

headers="$(curl -s -o /dev/null -D - "$base/" | tr -d '\r')"
for header in content-security-policy x-content-type-options referrer-policy permissions-policy \
  x-frame-options cross-origin-opener-policy cross-origin-resource-policy strict-transport-security; do
  grep -qi "^$header:" <<<"$headers" || fail "/ lacks $header"
done
grep -qi "^content-security-policy:.*frame-ancestors 'none'" <<<"$headers" || fail "CSP header lacks frame-ancestors 'none'"
grep -qi "^content-security-policy:.*script-src 'self' 'wasm-unsafe-eval' 'sha256-" <<<"$headers" || fail "CSP header has no script hashes"
if grep -q '__CONTENT_SECURITY_POLICY__' <<<"$headers"; then fail "CSP header is the unrendered template"; fi
[ "$(header_of speculation-rules "$base/")" = '"/speculation-rules.json"' ] || fail "/ lacks the Speculation-Rules header"
if grep -qi '^server:.*[0-9]' <<<"$headers"; then fail "the Server header leaks the nginx version"; fi
for path in /nope/ /es; do
  grep -qi '^x-content-type-options:' <<<"$(curl -s -o /dev/null -D - "$base$path")" || fail "$path lacks the security headers"
done

page="$(curl -s "$base/")"
grep -qi 'http-equiv="content-security-policy"' <<<"$page" || fail "/ has no CSP meta tag"
grep -q "'sha256-" <<<"$page" || fail "the CSP meta tag has no hashes"
for path in /es/docs/how-to/check-a-fleet.md /llms-full.txt; do
  [ "$(status "$base$path")" = 200 ] || fail "$path is not 200"
done
[ "$(header_of content-type "$base/es/docs/how-to/check-a-fleet.md")" = "text/markdown; charset=utf-8" ] || fail "the Markdown twin is not text/markdown; charset=utf-8"
[ "$(header_of content-encoding "$base/es/docs/how-to/check-a-fleet.md")" = gzip ] || fail "the Markdown twin is not gzipped"
[ "$(header_of content-encoding "$base/")" = gzip ] || fail "/ is not gzipped"

for path in /robots.txt /sitemap.xml /llms.txt /llms-full.txt /manifest.webmanifest \
  /.well-known/security.txt /speculation-rules.json /favicon.ico /favicon.svg /apple-touch-icon.png; do
  [ "$(status "$base$path")" = 200 ] || fail "$path is not 200"
done
[[ "$(header_of content-type "$base/.well-known/security.txt")" == text/plain* ]] || fail "security.txt is not text/plain"
security_txt="$(curl -s "$base/.well-known/security.txt")"
for field in Contact: Expires: Policy: Canonical:; do
  grep -q "^$field " <<<"$security_txt" || fail "security.txt lacks $field"
done
[ "$(header_of content-type "$base/speculation-rules.json")" = application/speculationrules+json ] || fail "the speculation rules have the wrong content-type"
if [ -n "${LAST_MODIFIED_DATES:-}" ]; then
  grep -q '<lastmod>[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}</lastmod>' <<<"$(curl -s "$base/sitemap.xml")" || fail "the sitemap has no lastmod dates"
fi

stars_status="$(status "$base/api/github-stars")"
if [ "$stars_status" = 200 ]; then
  [[ "$(header_of content-type "$base/api/github-stars")" == application/json* ]] || fail "/api/github-stars is not JSON"
  grep -q '"stargazers_count"' <<<"$(curl -s "$base/api/github-stars")" || fail "/api/github-stars has no stargazers_count"
else
  echo "NOTE: /api/github-stars returned $stars_status (GitHub unreachable); skipped"
fi

logs="$(docker logs "$name" 2>&1)"
grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.0 ' <<<"$logs" || fail "the access log is not masked"
if grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[1-9][0-9]* ' <<<"$logs"; then fail "the access log has a full IP"; fi

if [ "$failures" -gt 0 ]; then
  echo "$failures smoke check(s) failed" >&2
  exit 1
fi
echo "OK"
