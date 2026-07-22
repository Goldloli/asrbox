## MODIFIED Requirements

### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, licensing guidance, and truthful distinction between model-file availability and model-storage availability without bundling model weights in the application release.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model while model storage is available
- **THEN** the application identifies whether that model is downloaded and compatible in the configured managed model directory

#### Scenario: Model storage is unavailable
- **WHEN** the configured model storage root cannot be accessed
- **THEN** the catalog reports storage unavailable rather than reporting its managed models as not downloaded

### Requirement: Controlled model download lifecycle
Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local, storage-location, and on-disk state.

#### Scenario: User stops a download
- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

#### Scenario: Configured storage is unavailable
- **WHEN** a download, retry, resume, redownload, deletion, or cleanup action targets an unavailable configured root
- **THEN** the action fails with a storage-unavailable state without creating or using a fallback model directory

### Requirement: Compatibility before execution
Local transcription SHALL verify that the configured model storage is available and that the selected registered model has usable managed files and runtime support before execution.

#### Scenario: Model files are incomplete or incompatible
- **WHEN** the selected model cannot run in the current environment
- **THEN** transcription fails with an actionable compatibility state instead of being reported as successful

#### Scenario: Model storage disconnects before execution
- **WHEN** a local transcription reaches model readiness while the configured storage is unavailable
- **THEN** it fails with `MODEL_STORAGE_UNAVAILABLE` and does not reinterpret the model as never downloaded
