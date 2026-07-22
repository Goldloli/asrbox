#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bun install --frozen-lockfile
.venv/bin/python -m pip check
.venv/bin/python -m compileall -q backend
npm run check:versions
npm run test:release-tools
npm run verify:third-party
npm run typecheck
npm run build:web
npm run test:backend
cargo check --manifest-path tauri/src-tauri/Cargo.toml --locked
cargo test --manifest-path tauri/src-tauri/Cargo.toml --locked
npm run test:e2e:smoke
npm run test:e2e:llm

echo "ASRbox open-source readiness checks passed."
