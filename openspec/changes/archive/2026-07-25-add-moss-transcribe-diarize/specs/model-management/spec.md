## MODIFIED Requirements

### Requirement: Registered local model catalog
ASRbox SHALL expose the maintained local model catalog with its engine, source candidates, compatibility facts, storage estimate, and licensing guidance without bundling model weights in the application release. The catalog SHALL include end-to-end speaker-diarization models alongside conventional ASR engines.

The model management UI SHALL present detailed per-model facts: transcription capabilities (timestamps, word timestamps, diarization, streaming), language coverage, recommended scenarios, and known limitations, so users can choose a model without consulting external documentation.

#### Scenario: User selects a local model
- **WHEN** the user views or selects a registered model
- **THEN** the application identifies whether that model is available and compatible in the managed model directory

#### Scenario: User inspects model details
- **WHEN** the user expands a model's details in the model management UI
- **THEN** the application shows that model's capabilities, language coverage, recommended scenarios, and known limitations

## ADDED Requirements

### Requirement: Engine-native speaker diarization
Models registered with native diarization capability SHALL produce speaker-labelled transcript segments directly from the engine, without requiring a diarization token or a separate diarization model. When a transcription result already carries speaker labels, the task pipeline SHALL preserve those native labels and SHALL NOT apply task-level diarization post-processing over them.

#### Scenario: Native diarization without token configuration
- **WHEN** a transcription runs with a registered natively-diarizing model and no diarization token is configured
- **THEN** the task completes with engine-native speaker labels on the stored segments instead of failing for a missing token

#### Scenario: Native labels are not overwritten
- **WHEN** a transcription result's segments already carry speaker labels and task-level diarization is enabled
- **THEN** the pipeline skips diarization post-processing and keeps the engine-native labels
