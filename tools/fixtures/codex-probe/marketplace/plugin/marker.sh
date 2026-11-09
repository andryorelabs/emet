#!/bin/sh
cat >/dev/null
printf '%s\n' "${CLAUDE_PLUGIN_ROOT:-unset}" >>"${EMET_PROBE_MARKER:-/dev/null}"
exit 0
