## ADDED Requirements

### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, and licensing guidance without bundling model weights in the application release.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model
- **THEN** the application identifies whether that model is available and compatible in the managed model directory

### Requirement: Controlled model download lifecycle
Managed model downloads SHALL expose progress and supported pause, resume, stop, retry, redownload, and deletion actions with truthful process-local and on-disk state.

#### Scenario: User stops a download
- **WHEN** a user stops an active managed download
- **THEN** the worker is cancelled while reusable completed or partial files remain available to the documented retry or cleanup actions

### Requirement: Compatibility before execution
Local transcription SHALL verify that the selected registered model has usable managed files and runtime support before execution.

#### Scenario: Model files are incomplete or incompatible
- **WHEN** the selected model cannot run in the current environment
- **THEN** transcription fails with an actionable compatibility state instead of being reported as successful

### Requirement: Model data boundary
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata may be included but downloaded model weights and caches are excluded
