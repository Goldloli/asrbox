#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="asrbox-smoke-${$}"
PORT="${ASRBOX_DOCKER_TEST_PORT:-17504}"
TOKEN="${ASRBOX_DOCKER_TEST_TOKEN:-asrbox-docker-smoke-token}"
BASE_URL="http://127.0.0.1:${PORT}"
MARKER="Docker persistence ${PROJECT}"

compose() {
  ASRBOX_PORT="$PORT" \
  ASRBOX_BIND_ADDRESS=127.0.0.1 \
  ASRBOX_API_TOKEN="$TOKEN" \
  ASRBOX_DATA_VOLUME="${PROJECT}-data" \
    docker compose --project-name "$PROJECT" --file "$ROOT/compose.yaml" "$@"
}

authorized_curl() {
  curl --fail --silent --show-error -H "Authorization: Bearer ${TOKEN}" "$@"
}

wait_for_health() {
  for _attempt in $(seq 1 60); do
    if curl --fail --silent "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  compose logs
  return 1
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$ROOT"
docker compose --file compose.yaml config --quiet

if [ "${ASRBOX_DOCKER_SKIP_BUILD:-0}" != "1" ]; then
  compose build
fi
compose up --detach --no-build
wait_for_health

curl --fail --silent "${BASE_URL}/" | grep -q '<title>ASRbox</title>'
curl --fail --silent -H 'Accept: text/html' "${BASE_URL}/settings" | grep -q '<title>ASRbox</title>'
curl --fail --silent "${BASE_URL}/api-info" | grep -q 'ASRbox API'
authorized_curl "${BASE_URL}/runtime/status" | grep -q '"mlx_available":false'

authorized_curl \
  -H 'Content-Type: application/json' \
  --data "{\"name\":\"${MARKER}\",\"preset\":\"ollama\",\"base_url\":\"http://host.docker.internal:11434/v1\",\"default_model\":\"smoke-test\",\"enabled\":false}" \
  "${BASE_URL}/llm-providers" | grep -q "$MARKER"

compose stop
compose rm --force
compose up --detach --no-build
wait_for_health
authorized_curl "${BASE_URL}/llm-providers" | grep -q "$MARKER"

if [ "${ASRBOX_DOCKER_SKIP_BROWSER:-0}" != "1" ]; then
  ASRBOX_DOCKER_URL="$BASE_URL" ASRBOX_DOCKER_TOKEN="$TOKEN" \
    bunx playwright test app/e2e/docker-smoke.spec.ts --config=playwright.docker.config.ts
fi

echo "Docker smoke test passed at ${BASE_URL}."
