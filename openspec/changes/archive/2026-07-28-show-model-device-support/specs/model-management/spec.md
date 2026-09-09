## MODIFIED Requirements

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
