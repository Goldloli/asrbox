#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -x "$ROOT/.venv/Scripts/python.exe" ]; then
  VENV_PY="$ROOT/.venv/Scripts/python.exe"
else
  VENV_PY="$ROOT/.venv/bin/python"
fi

bun install --frozen-lockfile
"$VENV_PY" -m pip check
"$VENV_PY" -m compileall -q backend
npm run check:versions
npm run test:release-tools
npm run verify:third-party
npm run typecheck
npm run test:frontend:unit
npm run build:web
npm run test:backend
cargo check --manifest-path tauri/src-tauri/Cargo.toml --locked
cargo test --manifest-path tauri/src-tauri/Cargo.toml --locked
npm run test:e2e:maintained

echo "ASRbox open-source readiness checks passed."
