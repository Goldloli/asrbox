#!/bin/bash
set -euo pipefail

for attempt in 1 2 3; do
  set +e
  output="$(bun audit --json 2>&1)"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    printf '%s\n' "$output"
    exit 0
  fi
  printf '%s\n' "$output" >&2
  if ! grep -Eq 'ConnectionRefused|audit request failed' <<<"$output" || [ "$attempt" -eq 3 ]; then
    exit "$status"
  fi
  echo "Dependency audit service unavailable; retrying ($attempt/3)." >&2
  sleep "$((attempt * 2))"
done
