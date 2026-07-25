# transcription-lifecycle Specification

## Purpose
TBD - created by archiving change normalize-project-documentation. Update Purpose after archive.
## Requirements
### Requirement: Validated task creation
ASRbox SHALL validate the selected transcription backend, local model or enabled online provider, and accepted media constraints before treating a transcription task as valid.

#### Scenario: Invalid transcription selection
- **WHEN** a request lacks a usable model or enabled provider for its selected backend
- **THEN** the request fails explicitly without reporting a successful transcription

### Requirement: Truthful task outcome
A completed transcription SHALL contain the actual provider or local-engine result; missing engines, provider failures, empty invalid output, cancellation, and runtime failures SHALL remain explicit non-success states.

#### Scenario: Transcription engine fails
- **WHEN** the selected engine cannot produce a valid result
- **THEN** the task exposes a diagnosable failure and does not fabricate transcript text

### Requirement: Recoverable task lifecycle
The system SHALL expose enough persisted task, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results.

#### Scenario: Recoverable work is interrupted
- **WHEN** the application restarts or a retryable chunk fails
- **THEN** the user can identify and resume or retry the supported work from its recorded state

### Requirement: Optional post-transcription isolation
Optional analysis or post-processing SHALL NOT make a successful base transcription depend on an external or failure-prone service unless a future approved spec explicitly changes that behavior.

#### Scenario: Optional processing fails
- **WHEN** an optional post-transcription operation fails
- **THEN** the successful base transcript and its existing versions remain usable

