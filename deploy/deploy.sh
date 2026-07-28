#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-1200}"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available."
docker info >/dev/null 2>&1 || fail "Docker daemon is not running or is not accessible."

[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}. Copy .env.production.example and fill in real values."

if grep -Eq 'search\.example\.com|replace-with-' "${ENV_FILE}"; then
  fail "${ENV_FILE} still contains example values."
fi

printf '[1/4] Validating production configuration...\n'
"${COMPOSE[@]}" config --quiet

printf '[2/4] Building and starting services...\n'
"${COMPOSE[@]}" up -d --build --remove-orphans

printf '[3/4] Waiting for services to become ready...\n'
services=(postgres qdrant ai_service backend frontend caddy)
deadline=$((SECONDS + DEPLOY_TIMEOUT_SECONDS))

for service in "${services[@]}"; do
  while true; do
    container_id="$("${COMPOSE[@]}" ps --all -q "${service}")"
    [[ -n "${container_id}" ]] || fail "Container for ${service} was not created."

    state="$(docker inspect --format '{{.State.Status}}' "${container_id}")"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"

    if [[ "${state}" == "running" && ("${health}" == "healthy" || "${health}" == "none") ]]; then
      printf '  %-12s ready (%s)\n' "${service}" "${health}"
      break
    fi

    if [[ "${state}" == "exited" || "${state}" == "dead" || "${health}" == "unhealthy" ]]; then
      "${COMPOSE[@]}" logs --tail=100 "${service}" >&2
      fail "${service} failed while starting (state=${state}, health=${health})."
    fi

    if ((SECONDS >= deadline)); then
      "${COMPOSE[@]}" logs --tail=100 "${service}" >&2
      fail "Timed out waiting for ${service} (state=${state}, health=${health})."
    fi

    sleep 5
  done
done

printf '[4/4] Production stack is running.\n'
"${COMPOSE[@]}" ps

if [[ "${SKIP_SMOKE_TEST:-false}" != "true" ]]; then
  "${ROOT_DIR}/deploy/smoke-test.sh"
fi
