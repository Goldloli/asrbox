# model-management Specification

## Purpose
Defines the local ASR model catalog, its user-facing presentation, the download lifecycle, pre-execution compatibility, the model data boundary, and engine-native speaker diarization behavior.

## Requirements

### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, licensing guidance, supported inference device families, and truthful distinction between model-file availability and model-storage availability without bundling model weights in the application release. The catalog SHALL include end-to-end speaker-diarization models alongside conventional ASR engines. Device-family metadata SHALL reflect the device-selection paths maintained by each engine, SHALL distinguish CPU, CUDA, MPS, and MLX where applicable, and SHALL NOT represent static GPU support as the device currently active on the user's machine.

The model management UI SHALL present detailed per-model facts: transcription capabilities (timestamps, word timestamps, diarization, streaming), language coverage, supported inference devices, recommended scenarios, and known limitations, so users can choose a model without consulting external documentation. The transcription model selector and model management UI SHALL both provide a compact CPU/GPU support summary, while the model management details SHALL expose the specific accelerator family and explain that the device actually used depends on the current hardware and runtime.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model while model storage is available
- **THEN** the application identifies whether that model is downloaded and compatible in the configured managed model directory

#### Scenario: Model storage is unavailable
- **WHEN** the configured model storage root cannot be accessed
- **THEN** the catalog reports storage unavailable rather than reporting its managed models as not downloaded

#### Scenario: User inspects model details
- **WHEN** the user expands a model's details in the model management UI
- **THEN** the application shows that model's capabilities, language coverage, supported inference devices, recommended scenarios, and known limitations

#### Scenario: User compares devices in the transcription selector
- **WHEN** the user opens the local model selector before starting a transcription
- **THEN** each model option shows whether the model supports CPU, GPU acceleration, or both without claiming that a supported GPU is currently active

#### Scenario: User compares devices before download
- **WHEN** the user views a model list row or recommendation on the model management page
- **THEN** the application shows a compact CPU/GPU summary and makes the model's CUDA, MPS, or MLX accelerator family available in its detailed explanation

#### Scenario: GPU support depends on the current runtime
- **WHEN** a catalog model supports a GPU family that is absent or unavailable on the current machine
- **THEN** the UI keeps the capability label but explains that the actual device depends on current hardware and runtime availability, while existing compatibility and fallback behavior remains authoritative

### Requirement: Controlled model download lifecycle

Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local, storage-location, and on-disk state. Deletion SHALL validate that the model name is registered in the maintained catalog and that the resolved target directory remains inside the configured models root before removing any data; an unregistered or path-escaping name SHALL fail without touching the filesystem. The same lifecycle guarantees (progress, cancellation, retry, truthful state) SHALL apply to the managed CUDA acceleration kit download, and the kit SHALL additionally verify every extracted file against the pinned manifest SHA-256 entries before it may be enabled, rejecting kits from non-allowlisted sources.

#### Scenario: User stops a download

- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

#### Scenario: Configured storage is unavailable

- **WHEN** a download, retry, resume, redownload, deletion, or cleanup action targets an unavailable configured root
- **THEN** the action fails with a storage-unavailable state without creating or using a fallback model directory

#### Scenario: Deletion rejects an unregistered or escaping model name

- **WHEN** a deletion request carries a model name that is not in the registered catalog, or whose resolved directory would fall outside the models root
- **THEN** the request fails with a not-found state and no directory is removed

#### Scenario: Kit file fails integrity verification

- **WHEN** any extracted CUDA kit file hash differs from the pinned manifest, or the kit source is outside the allowlisted trusted origins
- **THEN** the kit is rejected as a whole, is never injected into the runtime, and the user is offered a clean retry

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
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts. A macOS Apple Silicon release that advertises MLX support SHALL include all runtime libraries and Metal resources required for a successful MLX import and SHALL verify that import during package smoke validation. The optional CUDA acceleration kit SHALL be downloaded into the application data directory at runtime and SHALL NOT be bundled into the installer, the repository, or release application artifacts; a kit whose pinned torch version does not match the running backend SHALL be marked outdated and excluded from injection until redownloaded.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata and required runtime libraries may be included, downloaded model weights and caches are excluded, and the packaged MLX runtime import check passes

#### Scenario: Backend upgrade outdates the kit
- **WHEN** the backend torch version no longer matches the installed kit manifest
- **THEN** the kit state becomes outdated, local execution stays on CPU, and the settings surface prompts a kit redownload

### Requirement: Engine-native speaker diarization
Models registered with native diarization capability SHALL produce speaker-labelled transcript segments directly from the engine, without requiring a diarization token or a separate diarization model. When a transcription result already carries speaker labels, the task pipeline SHALL preserve those native labels and SHALL NOT apply task-level diarization post-processing over them.

#### Scenario: Native diarization without token configuration
- **WHEN** a transcription runs with a registered natively-diarizing model and no diarization token is configured
- **THEN** the task completes with engine-native speaker labels on the stored segments instead of failing for a missing token

#### Scenario: Native labels are not overwritten
- **WHEN** a transcription result's segments already carry speaker labels and task-level diarization is enabled
- **THEN** the pipeline skips diarization post-processing and keeps the engine-native labels

### Requirement: Honest local acceleration state
Local inference SHALL execute on CUDA automatically when the CUDA acceleration kit is enabled and a compatible GPU is present, and SHALL fall back to CPU execution otherwise. A bounded probe SHALL validate at startup that an enabled kit is importable and CUDA-capable before it is used; probe failure SHALL keep execution on CPU and surface the reason honestly. The backend health surface SHALL report GPU availability truthfully for the running build and host.

#### Scenario: Enabled kit on a CUDA-capable host
- **WHEN** the CUDA kit is enabled and verified on a host with a compatible NVIDIA GPU
- **THEN** local transcription executes on CUDA and the health surface reports GPU availability as true

#### Scenario: Kit probe fails or no GPU is present
- **WHEN** the kit is enabled but the bounded probe cannot import it or no compatible GPU exists
- **THEN** execution falls back to CPU, the health surface reports GPU availability as false, and the failure reason is visible to the user

#### Scenario: Kit disabled or not downloaded
- **WHEN** the CUDA acceleration setting is off or no kit is installed
- **THEN** local execution uses CPU and the health surface reports GPU availability as false
