#!/usr/bin/env bash
# Builds the Website image from the repo root, runs it, and checks pages,
# redirects, the 404, security headers and masked logs. Not part of
# `bun run check`: run it by hand or from deploy-site.yml.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
image="emet-site-smoke"
name="emet-site-smoke-$$"

docker build -f "$root/apps/site/Dockerfile" -t "$image" "$root"
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

for path in / /es/ /docs/; do
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
[ "$(curl -s "$base/docs/guide/getting-started/" | grep -o 'rel="sitemap"[^>]*' | wc -l)" = 1 ] || fail "the docs head does not name exactly one sitemap"
curl -s "$base/docs/guide/getting-started/" | grep -q 'rel="sitemap"[^>]*href="/sitemap.xml"' || fail "the docs head does not name /sitemap.xml"
[ "$(status "$base/es/404/")" = 200 ] || fail "/es/404/ is not 200"
[ "$(header_of cache-control "$base/es/nope/")" = no-cache ] || fail "the locale 404 lacks no-cache"

for pair in "/es:/es/" "/docs:/docs/" "/index.html:/" "/es/index.html:/es/" "/pt-BR/:/pt-br/" "/zh_CN/:/zh-cn/"; do
  from="${pair%%:*}"
  to="${pair##*:}"
  [ "$(status "$base$from")" = 301 ] || fail "$from is not 301"
  [ "$(location "$base$from")" = "$to" ] || fail "$from does not redirect to $to"
done
[ "$(location "$base/es?a=1")" = "/es/?a=1" ] || fail "the trailing-slash redirect drops the query string"

headers="$(curl -s -o /dev/null -D - "$base/" | tr -d '\r')"
for header in content-security-policy x-content-type-options referrer-policy permissions-policy \
  x-frame-options cross-origin-opener-policy cross-origin-resource-policy strict-transport-security; do
  grep -qi "^$header:" <<<"$headers" || fail "/ lacks $header"
done
grep -qi "^content-security-policy:.*frame-ancestors 'none'" <<<"$headers" || fail "CSP header lacks frame-ancestors 'none'"
if grep -qi '^server:.*[0-9]' <<<"$headers"; then fail "the Server header leaks the nginx version"; fi
for path in /nope/ /es; do
  grep -qi '^x-content-type-options:' <<<"$(curl -s -o /dev/null -D - "$base$path")" || fail "$path lacks the security headers"
done

page="$(curl -s "$base/")"
grep -qi 'http-equiv="content-security-policy"' <<<"$page" || fail "/ has no CSP meta tag"
grep -q "'sha256-" <<<"$page" || fail "the CSP meta tag has no hashes"
[ "$(header_of content-encoding "$base/")" = gzip ] || fail "/ is not gzipped"

logs="$(docker logs "$name" 2>&1)"
grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.0 ' <<<"$logs" || fail "the access log is not masked"
if grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[1-9][0-9]* ' <<<"$logs"; then fail "the access log has a full IP"; fi

if [ "$failures" -gt 0 ]; then
  echo "$failures smoke check(s) failed" >&2
  exit 1
fi
echo "OK"
