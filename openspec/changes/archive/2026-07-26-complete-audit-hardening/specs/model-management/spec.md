## MODIFIED Requirements

### Requirement: Compatibility before execution

Local transcription SHALL verify that the configured model storage is available and that the selected registered model has usable managed files and executable runtime support before execution. Runtime support SHALL require importing the engine's executable module rather than only discovering module metadata, and failures SHALL retain an actionable import reason. Status and compatibility inspection SHALL perform heavy framework imports in a bounded short-lived probe process and cache its small structured result, so the long-running API process does not retain Torch, FunASR, MLX, or equivalent framework memory solely because a status endpoint was viewed.

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
