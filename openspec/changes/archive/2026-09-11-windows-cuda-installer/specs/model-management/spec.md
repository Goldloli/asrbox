# model-management delta（windows-cuda-installer）

## MODIFIED Requirements

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

### Requirement: Model data boundary
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts. A macOS Apple Silicon release that advertises MLX support SHALL include all runtime libraries and Metal resources required for a successful MLX import and SHALL verify that import during package smoke validation. The optional CUDA acceleration kit SHALL be downloaded into the application data directory at runtime and SHALL NOT be bundled into the installer, the repository, or release application artifacts; a kit whose pinned torch version does not match the running backend SHALL be marked outdated and excluded from injection until redownloaded.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata and required runtime libraries may be included, downloaded model weights and caches are excluded, and the packaged MLX runtime import check passes

#### Scenario: Backend upgrade outdates the kit
- **WHEN** the backend torch version no longer matches the installed kit manifest
- **THEN** the kit state becomes outdated, local execution stays on CPU, and the settings surface prompts a kit redownload

## ADDED Requirements

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
