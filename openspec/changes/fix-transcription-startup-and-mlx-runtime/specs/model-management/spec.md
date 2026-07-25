## MODIFIED Requirements

### Requirement: Compatibility before execution
Local transcription SHALL verify that the selected registered model has usable managed files and executable runtime support before execution. Runtime support SHALL require importing the engine's executable module rather than only discovering module metadata, and failures SHALL retain an actionable import reason.

#### Scenario: Model files are incomplete or incompatible
- **WHEN** the selected model cannot run in the current environment
- **THEN** transcription fails with an actionable compatibility state instead of being reported as successful

#### Scenario: Packaged MLX native dependency is missing
- **WHEN** the Apple Silicon package cannot import `mlx.core` or `mlx_whisper`
- **THEN** the MLX model is marked incompatible before task execution and the native loader error is shown as the reason

### Requirement: Model data boundary
Downloaded weights, upstream caches, and incomplete model data SHALL remain outside the repository and packaged application artifacts. A macOS Apple Silicon release that advertises MLX support SHALL include all runtime libraries and Metal resources required for a successful MLX import and SHALL verify that import during package smoke validation.

#### Scenario: Desktop release is built
- **WHEN** release artifacts are assembled
- **THEN** registered model metadata and required runtime libraries may be included, downloaded model weights and caches are excluded, and the packaged MLX runtime import check passes
