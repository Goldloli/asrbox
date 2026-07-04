# ASRbox Backend API Freeze

This file defines the backend contract that the next frontend rewrite may rely on.

## Stable Read APIs

- `GET /transcriptions/readiness`
- `POST /transcriptions/preflight`
- `GET /models/status`
- `GET /models/active-downloads`
- `GET /models/storage`
- `GET /tasks`
- `GET /tasks/active`
- `GET /tasks/{id}`
- `GET /tasks/{id}/diagnostics`
- `GET /tasks/{id}/logs`
- `GET /tasks/{id}/versions`
- `GET /runtime/status`
- `GET /events`

## Stable Mutating APIs

- `POST /transcriptions`
- `POST /transcriptions/batch`
- `POST /models/download`
- `POST /models/{model_name}/unload`
- `POST /models/{model_name}/cancel-download`
- `DELETE /models/{model_name}`
- `POST /tasks/{id}/cancel`
- `POST /tasks/{id}/retry`
- `POST /tasks/{id}/retranscribe`
- `POST /tasks/{id}/postprocess`
- `POST /tasks/{id}/chunks/retry-failed`
- `POST /tasks/{id}/cleanup-artifacts`

## Field Semantics

- `ASRModelStatus.downloaded` means the ASRbox local model directory is runnable.
- `ASRModelStatus.cache_detected` means a Hugging Face or ModelScope cache was detected; it does not imply the model is runnable.
- `ASRModelStatus.compatible` means required files and runtime support are present.
- `ASRModelStatus.preferred_source` is the highest-priority configured download source.
- `ASRModelStatus.source_candidates[]` lists ordered source candidates with `source`, `repo_id`, `priority`, and `verified`.
- `ASRModelStatus.installed_source` and `installed_repo_id` describe the source that actually produced the local model marker.
- `TranscriptionReadinessResponse.checks[]` contains `key`, `status`, `message`, and `action`.
- `ActiveTasksResponse` is the frontend recovery source for downloads, queued/running tasks, chunks, orphan tasks, failed-resumable tasks, worker state, cancelled ids, and recent errors.
- Frontend code must not rely on internal `options_json` keys unless they are surfaced in a typed response.

## Contract Tests

- `npm run test:backend:contract` verifies registered stable routes, stable model status fields, readiness checks, active task fields, and stable event types.

## Stable Event Types

- `task.updated`
- `task.failed`
- `task.completed`
- `chunk.updated`
- `model.download.updated`
- `runtime.warning`
- `storage.warning`
