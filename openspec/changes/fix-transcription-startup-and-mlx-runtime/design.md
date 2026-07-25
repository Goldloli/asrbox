## Context

The browser-oriented transcription API receives multipart files. On desktop, a selected local file is currently uploaded over loopback for preflight and then uploaded again for task creation; Starlette spools each request and ASRbox copies the second spool into managed uploads before inserting the task row. A 6.31 GB test video therefore remains invisible to the task lifecycle until two complete transfers have finished.

The Apple Silicon package includes Python MLX modules and `libmlx.dylib`, but PyInstaller does not collect `mlx/lib/libjaccl.dylib`. Runtime status uses `find_spec`, which reports both MLX modules as present even though importing `mlx.core` fails. The model catalog therefore advertises the MLX model as compatible and the worker later reduces the native loader failure to "mlx_whisper is not installed".

The desktop backend remains token-protected on `127.0.0.1:17494`; Web and Docker clients must not gain arbitrary host-path access. Existing task results and upload API clients must remain compatible.

## Goals / Non-Goals

**Goals:**

- Insert desktop tasks immediately and expose import progress while preserving a managed input copy.
- Use an APFS clone when possible and a progress-reporting streamed copy as a safe cross-volume fallback.
- Upload Web media once in the normal Start flow and show byte progress before the task response exists.
- Keep explicit preflight available without making Start repeat it automatically.
- Make MLX compatibility depend on an executable import and preserve the native import error in user-facing diagnostics.
- Collect and smoke-check every native MLX dependency in the macOS package.

**Non-Goals:**

- Resumable or chunked browser uploads.
- Changing Docker host-mount policy or allowing Web clients to submit server filesystem paths.
- Retaining a warm transcription worker or changing model inference algorithms.
- Removing managed source media from existing or newly created tasks.

## Decisions

### Desktop uses a guarded native-path API

Tauri will return selected media metadata, including absolute paths, through a native picker. The sidecar receives `ASRBOX_DESKTOP_MODE=1`; a dedicated JSON endpoint accepts local paths only when that flag is set. Web and Docker calls receive a not-found response so the endpoint does not become a host filesystem oracle.

Alternative considered: infer a path from browser `File` objects. Browser/Tauri file objects do not provide a stable supported absolute-path contract, so this would be version-dependent and could silently fall back to duplicate uploads.

### Path ingestion is a task stage

The path endpoint creates an `importing` task row with a managed destination and transient source metadata, then queues the existing local/provider worker. The worker attempts an atomic filesystem clone into a temporary destination; if cloning is unsupported or crosses volumes, it streams one copy and periodically persists import progress. It atomically renames the complete temporary file, removes transient source metadata, and only then enters preprocessing. Failure removes the partial destination while leaving the selected source untouched.

Alternative considered: transcribe directly from the selected path. That is faster but makes retries, playback, and task history depend on a source that the user can move, modify, eject, or delete.

### Web Start performs one upload with client-side progress

The Start action no longer invokes preflight automatically. Media validation still occurs in the normal task worker and produces a diagnosable failed task for invalid media. The API client uses `XMLHttpRequest.upload` for multipart requests that request progress reporting, while preserving the existing typed response and bearer token behavior. Explicit Preflight remains a separate user action.

Alternative considered: retain a preflight upload token and promote the staged file. This would avoid a second upload after an explicit preflight but requires expiry, orphan cleanup, token ownership, and recovery semantics beyond this focused fix.

### MLX support is proven by import, not discovery

Runtime inspection imports `mlx.core` and `mlx_whisper`, records the exact exception when either fails, and uses that result for model compatibility. The local worker retains the import exception and emits it when MLX execution is requested. PyInstaller explicitly collects MLX binaries and data, including `libjaccl.dylib`, `mlx.metallib`, and `mlx_whisper` assets such as `mel_filters.npz`. Because the Tauri macOS bundler dereferences MLX's top-level dylib symlink, the build also places `mlx.metallib` beside that bundled dylib. Packaged smoke validation runs a runtime-check CLI path that performs the same imports without requiring model weights.

Alternative considered: special-case only the missing dylib in the build. Real import validation also catches future missing Metal resources, incompatible wheels, architectures, or transitive libraries and prevents another false-positive UI state.

## Risks / Trade-offs

- [A source file is changed or removed before its queued import starts] -> Import fails explicitly, the task records the source-stage diagnostic, and no managed partial file is treated as valid.
- [Absolute source paths are persisted briefly] -> The path API is desktop-only, source metadata is removed after import, and diagnostics do not include the path unless required for an actionable local error.
- [Web users lose synchronous preflight rejection on Start] -> Worker preflight remains authoritative, task failure is visible and retryable, and the explicit Preflight command is unchanged.
- [Clone behavior differs by filesystem] -> Clone is only an optimization; all failures fall back to a bounded-memory copy with the same atomic destination semantics.
- [Import status affects existing UI status maps] -> Add `importing` to all active/status mappings and contract fixtures before enabling the route.

## Migration Plan

No database migration is required because task status is stored as a string and transient ingestion metadata uses the existing options payload. Ship backend, typed client, Tauri picker, and status UI together. Existing multipart endpoints and task rows remain valid. Rollback removes the native picker/path calls and returns desktop to multipart upload; imported managed files require no conversion.

## Open Questions

None. Resumable Web uploads and long-term source-media retention policy can be proposed separately if testing shows they are needed.
