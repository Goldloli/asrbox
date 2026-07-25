## 1. Desktop Media Ingestion

- [x] 1.1 Add desktop-only typed path preflight and task-creation contracts guarded by the sidecar runtime flag
- [x] 1.2 Add native Tauri multi-file media selection with path, name, and byte-size metadata
- [x] 1.3 Implement atomic clone-or-copy ingestion with persisted `importing` progress and source-preserving failure cleanup
- [x] 1.4 Route desktop selections through path ingestion while retaining multipart selection for Web/Docker

## 2. Truthful Start Feedback

- [x] 2.1 Remove the duplicate automatic preflight upload from Start while retaining explicit Preflight
- [x] 2.2 Add bearer-authenticated multipart upload progress to the typed API client and transcription UI
- [x] 2.3 Add `importing` to active-task types, labels, filters, badges, and task-center presentation

## 3. Apple MLX Runtime

- [x] 3.1 Replace MLX module discovery with executable import checks and preserve actionable import errors
- [x] 3.2 Block incompatible MLX selection/execution before worker launch and report the runtime reason in model status
- [x] 3.3 Collect MLX native binaries and Metal data in the PyInstaller build, including `libjaccl.dylib`
- [x] 3.4 Add a packaged runtime-check command and build smoke validation that imports `mlx.core` and `mlx_whisper` without model weights

## 4. Verification

- [x] 4.1 Add backend tests for desktop-path access control, import progress, clone/copy fallback, and source-preserving failures
- [x] 4.2 Add runtime and build tests covering MLX import failure reporting and required package collection
- [x] 4.3 Add frontend tests for desktop path routing, Web upload progress, and removal of duplicate automatic preflight
- [x] 4.4 Run focused tests, backend contract tests, frontend typecheck/build, Cargo checks, OpenSpec validation, and open-source checks
- [x] 4.5 Build the macOS package and verify the packaged MLX runtime check plus a minimal local worker transcription against an external test model
