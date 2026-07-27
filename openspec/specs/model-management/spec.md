# model-management Specification

## Purpose
Defines the local ASR model catalog, its user-facing presentation, the download lifecycle, pre-execution compatibility, the model data boundary, and engine-native speaker diarization behavior.
## Requirements
### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, licensing guidance, and truthful distinction between model-file availability and model-storage availability without bundling model weights in the application release. The catalog SHALL include end-to-end speaker-diarization models alongside conventional ASR engines.

The model management UI SHALL present detailed per-model facts: transcription capabilities (timestamps, word timestamps, diarization, streaming), language coverage, recommended scenarios, and known limitations, so users can choose a model without consulting external documentation.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model while model storage is available
- **THEN** the application identifies whether that model is downloaded and compatible in the configured managed model directory

#### Scenario: Model storage is unavailable
- **WHEN** the configured model storage root cannot be accessed
- **THEN** the catalog reports storage unavailable rather than reporting its managed models as not downloaded

#### Scenario: User inspects model details
- **WHEN** the user expands a model's details in the model management UI
- **THEN** the application shows that model's capabilities, language coverage, recommended scenarios, and known limitations

### Requirement: Controlled model download lifecycle

Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local, storage-location, and on-disk state. Deletion SHALL validate that the model name is registered in the maintained catalog and that the resolved target directory remains inside the configured models root before removing any data; an unregistered or path-escaping name SHALL fail without touching the filesystem.

#### Scenario: User stops a download

- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

#### Scenario: Configured storage is unavailable

- **WHEN** a download, retry, resume, redownload, deletion, or cleanup action targets an unavailable configured root
- **THEN** the action fails with a storage-unavailable state without creating or using a fallback model directory

#### Scenario: Deletion rejects an unregistered or escaping model name

- **WHEN** a deletion request carries a model name that is not in the registered catalog, or whose resolved directory would fall outside the models root
- **THEN** the request fails with a not-found state and no directory is removed

### Requirement: Compatibility before execution

Local transcription SHALL verify that the configured model storage is available and that the selected registered model has usable managed files and executable runtime support before execution. Runtime support SHALL require importing the engine's executable module rather than only discovering module metadata, and failures SHALL retain an actionable import reason. Status and compatibility inspection SHALL perform heavy framework imports in a bounded short-lived probe process and cache its small structured result, so the long-running API process does not retain Torch, FunASR, MLX, or equivalent framework memory solely because a status endpoint was viewed. API routes that wait for the bounded probe SHALL execute that synchronous wait outside the application event loop so unrelated requests remain responsive.

#### Scenario: Model files are incomplete or incompatible

- **WHEN** the selected model cannot run in the current environment
- **THEN** transcription fails with an actionable compatibility state instead of being reported as successful

#### Scenario: Packaged MLX native dependency is missing

- **WHEN** the Apple Silicon package cannot import `mlx.core` or `mlx_whisper`
- **THEN** the MLX model is marked incompatible before task execution and the native loader error is shown as the reason

#### Scenario: Model storage disconnects before execution

- **WHEN** a local transcription reaches model readiness while the configured storage is unavailable
- **THEN** it fails with `MODEL_STORAGE_UNAVAILABLE` and does not reinterpret the model as never downloaded

#### Scenario: User opens model or runtime status

- **WHEN** compatibility inspection requires real imports of installed heavy runtimes
- **THEN** those imports execute in one bounded probe process whose exit releases framework memory while the API process retains only the cached result

#### Scenario: Runtime probe stalls

- **WHEN** the first runtime status or health request waits on a slow probe process
- **THEN** unrelated API requests continue on the event loop and the probe still returns or fails within its maintained total timeout

### Requirement: Model data boundary
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts. A macOS Apple Silicon release that advertises MLX support SHALL include all runtime libraries and Metal resources required for a successful MLX import and SHALL verify that import during package smoke validation.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata and required runtime libraries may be included, downloaded model weights and caches are excluded, and the packaged MLX runtime import check passes

### Requirement: Engine-native speaker diarization
Models registered with native diarization capability SHALL produce speaker-labelled transcript segments directly from the engine, without requiring a diarization token or a separate diarization model. When a transcription result already carries speaker labels, the task pipeline SHALL preserve those native labels and SHALL NOT apply task-level diarization post-processing over them.

#### Scenario: Native diarization without token configuration
- **WHEN** a transcription runs with a registered natively-diarizing model and no diarization token is configured
- **THEN** the task completes with engine-native speaker labels on the stored segments instead of failing for a missing token

#### Scenario: Native labels are not overwritten
- **WHEN** a transcription result's segments already carry speaker labels and task-level diarization is enabled
- **THEN** the pipeline skips diarization post-processing and keeps the engine-native labels

