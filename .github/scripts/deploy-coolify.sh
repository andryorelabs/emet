#!/usr/bin/env bash
# Triggers a Coolify deploy of the Website and waits for its result.
# Requires COOLIFY_API_TOKEN (a GitHub secret with the `deploy` ability) and
# COOLIFY_APP_UUID (the SITE_COOLIFY_APP_UUID repository variable).
# The token is never printed and never put on a command line: curl reads the
# Authorization header from a process substitution.
set -euo pipefail

api_base="https://app.coolify.io/api/v1"
poll_interval_seconds=10
max_polls=90

if [[ -z "${COOLIFY_API_TOKEN:-}" || -z "${COOLIFY_APP_UUID:-}" ]]; then
  echo "::error::COOLIFY_API_TOKEN or COOLIFY_APP_UUID is missing."
  exit 1
fi

if [[ ! "${COOLIFY_APP_UUID}" =~ ^[A-Za-z0-9-]+$ ]]; then
  echo "::error::COOLIFY_APP_UUID is not a plain identifier."
  exit 1
fi

coolify_request() {
  local method="$1"
  local path="$2"
  curl --silent --show-error --fail --max-time 30 \
    --request "${method}" \
    --header @<(printf 'Authorization: Bearer %s\n' "${COOLIFY_API_TOKEN}") \
    "${api_base}/${path}"
}

trigger_response=$(coolify_request POST "deploy?uuid=${COOLIFY_APP_UUID}&force=false") || {
  echo "::error::Coolify rejected the deploy request. Check that the token has the deploy ability."
  exit 1
}

deployment_uuid=$(jq -r '.deployments[0].deployment_uuid // empty' <<<"${trigger_response}")
if [[ ! "${deployment_uuid}" =~ ^[A-Za-z0-9-]+$ ]]; then
  echo "::error::Coolify did not return a deployment uuid."
  exit 1
fi
echo "Deployment queued: ${deployment_uuid}"

for ((poll = 1; poll <= max_polls; poll++)); do
  status=$(coolify_request GET "deployments/${deployment_uuid}" | jq -r '.status // "unknown"') || status="unknown"
  echo "Deployment status: ${status}"
  case "${status}" in
    finished)
      echo "Deploy succeeded."
      exit 0
      ;;
    failed | cancelled-by-user)
      echo "::error::Coolify deployment ${deployment_uuid} ended with status '${status}'. Check the build logs in Coolify."
      exit 1
      ;;
  esac
  sleep "${poll_interval_seconds}"
done

echo "::error::Coolify deployment ${deployment_uuid} did not finish within $((max_polls * poll_interval_seconds)) seconds."
exit 1
