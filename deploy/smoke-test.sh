#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is not installed."

if [[ -n "${1:-}" ]]; then
  base_url="${1%/}"
else
  [[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}; pass the base URL as the first argument."
  app_domain="$(awk -F= '$1 == "APP_DOMAIN" {sub(/^[^=]*=/, ""); print; exit}' "${ENV_FILE}")"
  [[ -n "${app_domain}" ]] || fail "APP_DOMAIN is missing from ${ENV_FILE}."
  base_url="https://${app_domain%/}"
fi

request() {
  local path="$1"
  local expected_status="$2"
  local body_file
  local status

  body_file="$(mktemp)"
  status="$(curl --silent --show-error --location \
    --connect-timeout 10 --max-time 30 \
    --output "${body_file}" --write-out '%{http_code}' \
    "${base_url}${path}")" || {
      rm -f "${body_file}"
      fail "Request failed: ${base_url}${path}"
    }

  if [[ "${status}" != "${expected_status}" ]]; then
    printf 'Response body:\n' >&2
    cat "${body_file}" >&2
    rm -f "${body_file}"
    fail "${path} returned ${status}; expected ${expected_status}."
  fi

  rm -f "${body_file}"
  printf '  PASS %-24s HTTP %s\n' "${path}" "${status}"
}

printf 'Running smoke tests against %s\n' "${base_url}"
request "/" "200"
request "/api/v1/auth/me" "401"
printf 'Smoke tests passed.\n'
