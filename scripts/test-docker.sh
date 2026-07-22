#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="asrbox-smoke-${$}"
PORT="${ASRBOX_DOCKER_TEST_PORT:-17504}"
TOKEN="${ASRBOX_DOCKER_TEST_TOKEN:-asrbox-docker-smoke-token}"
BASE_URL="http://127.0.0.1:${PORT}"
MARKER="Docker persistence ${PROJECT}"
MODEL_STORAGE_DIR="$(mktemp -d "$ROOT/.docker-model-storage.XXXXXX")"
MOUNTED_CONTAINER="${PROJECT}-mounted"

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

assert_model_storage() {
  local expected_root="$1"
  local expected_status="$2"
  authorized_curl "${BASE_URL}/models/storage" | \
    EXPECTED_ROOT="$expected_root" EXPECTED_STATUS="$expected_status" "$ROOT/.venv/bin/python" -c '
import json
import os
import sys

storage = json.load(sys.stdin)
root = os.environ["EXPECTED_ROOT"]
status = os.environ["EXPECTED_STATUS"]
assert storage["root"] == root, storage
assert storage["status"] == status, storage
assert storage["available"] == (status == "available"), storage
assert storage["models_dir"] == f"{root}/models", storage
assert storage["cache_dirs"] == {
    "huggingface": f"{root}/cache/huggingface",
    "modelscope": f"{root}/cache/modelscope",
    "torch": f"{root}/cache/torch",
    "xdg": f"{root}/cache/xdg",
}, storage
'
}

relocate_model_storage() {
  local target="$1"
  authorized_curl \
    -X POST \
    -H 'Content-Type: application/json' \
    --data "{\"target_root\":\"${target}\",\"mode\":\"adopt\",\"include_shared_caches\":false,\"acknowledge_network\":false}" \
    "${BASE_URL}/models/storage/relocation" >/dev/null

  for _attempt in $(seq 1 60); do
    local status
    status="$(authorized_curl "${BASE_URL}/models/storage/relocation" | "$ROOT/.venv/bin/python" -c 'import json, sys; print(json.load(sys.stdin)["status"])')"
    case "$status" in
      complete)
        return 0
        ;;
      failed|cancelled)
        authorized_curl "${BASE_URL}/models/storage/relocation"
        return 1
        ;;
    esac
    sleep 1
  done
  authorized_curl "${BASE_URL}/models/storage/relocation"
  return 1
}

cleanup() {
  docker rm --force "$MOUNTED_CONTAINER" >/dev/null 2>&1 || true
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$MODEL_STORAGE_DIR"
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
assert_model_storage /data available

authorized_curl \
  -H 'Content-Type: application/json' \
  --data "{\"name\":\"${MARKER}\",\"preset\":\"ollama\",\"base_url\":\"http://host.docker.internal:11434/v1\",\"default_model\":\"smoke-test\",\"enabled\":false}" \
  "${BASE_URL}/llm-providers" | grep -q "$MARKER"

compose stop
compose rm --force
compose up --detach --no-build
wait_for_health
authorized_curl "${BASE_URL}/llm-providers" | grep -q "$MARKER"

# Reuse the persistent /data volume while exposing an allowlisted model bind mount.
compose stop
compose rm --force
chmod 0777 "$MODEL_STORAGE_DIR"
IMAGE="${ASRBOX_IMAGE:-asrbox:local}"
docker run \
  --detach \
  --name "$MOUNTED_CONTAINER" \
  --publish "127.0.0.1:${PORT}:17494" \
  --volume "${PROJECT}-data:/data" \
  --volume "${MODEL_STORAGE_DIR}:/model-storage" \
  --env ASRBOX_API_TOKEN="$TOKEN" \
  --env ASRBOX_MODEL_STORAGE_ROOTS=/data,/model-storage \
  "$IMAGE" >/dev/null
wait_for_health
authorized_curl "${BASE_URL}/models/storage" | grep -q '"allowed_roots":\["/data","/model-storage"\]'
relocate_model_storage /model-storage
assert_model_storage /model-storage available

# Removing the bind mount must preserve the configured root and report it unavailable.
docker rm --force "$MOUNTED_CONTAINER" >/dev/null
compose up --detach --no-build
wait_for_health
assert_model_storage /model-storage unavailable
compose exec --no-TTY asrbox sh -c 'test ! -e /model-storage'
relocate_model_storage /data
assert_model_storage /data available

if [ "${ASRBOX_DOCKER_SKIP_BROWSER:-0}" != "1" ]; then
  ASRBOX_DOCKER_URL="$BASE_URL" ASRBOX_DOCKER_TOKEN="$TOKEN" \
    bunx playwright test app/e2e/docker-smoke.spec.ts --config=playwright.docker.config.ts
fi

echo "Docker smoke test passed at ${BASE_URL}."
