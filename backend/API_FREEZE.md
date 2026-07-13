# ASRbox Backend API Stability Boundary

This document records the backend contract used by the current React/Tauri frontend. ASRbox is pre-1.0, so “stable” means changes require coordinated frontend updates, tests, and documentation; it is not a permanent compatibility promise.

## Runtime and Readiness

- `GET /health`
- `GET /runtime/status`
- `GET /runtime/health-report`
- `GET /runtime/diagnostic-bundle.zip`
- `GET /transcriptions/readiness`
- `POST /transcriptions/preflight`
- `GET /events`

## Model Read APIs

- `GET /models/status`
- `GET /models/cache-dir`
- `GET /models/active-downloads`
- `GET /models/storage`
- `GET /models/progress/{model_name}`
- `GET /models/{model_name}/compatibility`
- `POST /models/verify`
- `POST /models/recommend`
- `GET /models/benchmark`

## Model Mutating APIs

- `POST /models/download`
- `POST /models/{model_name}/pause-download`
- `POST /models/{model_name}/resume-download`
- `POST /models/{model_name}/stop-download`
- `POST /models/{model_name}/retry-download`
- `POST /models/{model_name}/cancel-download` (legacy frontend-compatible stop action)
- `POST /models/{model_name}/redownload`
- `POST /models/{model_name}/unload`
- `DELETE /models/{model_name}`
- `POST /models/cleanup-incomplete`
- `POST /models/migrate`
- `GET /models/migrate/progress`
- `POST /models/benchmark`
- `DELETE /models/benchmark/{benchmark_id}`

## Task and Transcription APIs

- `POST /transcriptions`
- `POST /transcriptions/batch`
- `GET /tasks`
- `GET /tasks/active`
- `GET /tasks/{task_id}`
- `GET /tasks/{task_id}/diagnostics`
- `GET /tasks/{task_id}/logs`
- `GET /tasks/{task_id}/versions`
- `GET /tasks/{task_id}/versions/{version_id}/export/{fmt}`
- `POST /tasks/{task_id}/versions/{version_id}/restore`
- `POST /tasks/{task_id}/cancel`
- `POST /tasks/{task_id}/retry`
- `POST /tasks/{task_id}/retranscribe`
- `POST /tasks/{task_id}/postprocess`
- `POST /tasks/{task_id}/chunks/retry-failed`
- `POST /tasks/{task_id}/cleanup-artifacts`

## Model Field Semantics

- `ASRModelStatus.downloaded`: the ASRbox-managed directory has a marker and usable weights.
- `ASRModelStatus.downloading`: the current backend process has an active worker for the model.
- `ASRModelStatus.compatible`: required files and runtime support are available.
- `ASRModelStatus.cache_detected`: an upstream cache was found; this does not imply a runnable managed model.
- `ASRModelStatus.preferred_source`: highest-priority configured source.
- `ASRModelStatus.source_candidates[]`: ordered source/repository candidates.
- `ASRModelStatus.installed_source` and `installed_repo_id`: source that produced the managed model marker.
- `ActiveDownloadResponse.status`: includes `queued`, `downloading`, `paused`, `extracting`, `complete`, `cancelled`, or `error` where applicable.
- `ModelStorageResponse.models_dir`: resolved managed model root.
- `ModelStorageResponse.used_bytes`: bytes below registered model directories.
- `ModelStorageResponse.free_bytes` and `total_bytes`: capacity for the filesystem containing the model root.
- `ModelStorageItem.size_bytes`: actual bytes in that model's managed directory.

Stopping a download is cooperative. The request marks the worker cancelled; completed and partial files remain until retry, redownload, delete, or incomplete cleanup.

## Task Field Semantics

- `TranscriptionReadinessResponse.checks[]` contains `key`, `status`, `message`, and `action`.
- `ActiveTasksResponse` is the recovery source for downloads, queued/running tasks, chunks, orphan tasks, failed-resumable tasks, worker state, cancelled ids, and recent errors.
- Transcript versions are immutable snapshots surfaced by the versions API; restore creates another auditable version.
- Frontend code must not depend on internal `options_json` keys unless a typed response exposes them.

## Stable Event Types

- `task.updated`
- `task.failed`
- `task.completed`
- `chunk.updated`
- `model.download.updated`
- `runtime.warning`
- `storage.warning`

## Contract Verification

`npm run test:backend:contract` verifies registered stable routes, model status/storage fields, readiness checks, active-task recovery fields, and stable event types. Any incompatible API change must update the frontend client, contract test, and this document in the same change.
