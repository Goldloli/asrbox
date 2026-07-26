## Why

Large local media currently passes through a full preflight upload and a second task-creation upload before a task exists, leaving the desktop UI at an uninformative "starting" state for minutes. The Apple Silicon model path is also advertised as compatible even when the packaged MLX native runtime cannot be imported, so a downloaded model fails only after execution starts.

## What Changes

- Give desktop media selection a native-path submission flow so local files are not sent through the loopback HTTP upload path twice.
- Make media ingestion an explicit, observable task stage and show truthful upload/import progress while Web clients transfer media.
- Avoid repeating automatic preflight work when starting a file that has already passed the same preflight.
- Verify MLX by importing its executable runtime instead of checking only for module metadata, and expose actionable incompatibility details before transcription.
- Package all MLX native libraries required by the Apple Silicon worker and add packaged-runtime smoke coverage.
- Preserve Docker/Web isolation: browser clients continue to upload media and cannot submit arbitrary host paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transcription-lifecycle`: Task creation and media ingestion become observable, desktop path ingestion avoids redundant transfer, and Web upload progress is explicit.
- `model-management`: Runtime compatibility must reflect a real engine import, and packaged Apple Silicon releases must contain a runnable MLX runtime.

## Impact

- Frontend transcription selection, progress state, typed API client, and task status presentation under `app/`.
- FastAPI transcription routes, task ingestion lifecycle, runtime detection, and contract/API tests under `backend/`.
- Tauri native file selection and desktop-only backend environment under `tauri/`.
- PyInstaller collection rules and desktop package smoke checks under `backend/build_binary.py` and `scripts/`.
- The maintained transcription and model-management API surface gains desktop path-ingestion request/response behavior and runtime diagnostics.
