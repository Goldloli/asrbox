## MODIFIED Requirements

### Requirement: Validated task creation
ASRbox SHALL validate the selected transcription backend, local model or enabled online provider, and accepted media constraints before treating a transcription task as valid. Desktop local-path ingestion SHALL be available only to the desktop sidecar and SHALL expose an importing task before managed media copying completes; Web media transfer SHALL expose truthful client-side upload progress.

#### Scenario: Invalid transcription selection
- **WHEN** a request lacks a usable model or enabled provider for its selected backend
- **THEN** the request fails explicitly without reporting a successful transcription

#### Scenario: Desktop starts a large local file
- **WHEN** the desktop user starts transcription for a local media path
- **THEN** one task is created without loopback media upload, import progress becomes observable, and preprocessing starts only after an atomic managed copy exists

#### Scenario: Web uploads media
- **WHEN** a Web client starts transcription with a multipart media file
- **THEN** the client shows upload progress and does not perform an additional automatic preflight upload

#### Scenario: Desktop path API is called outside desktop mode
- **WHEN** a Web or Docker client attempts to submit a server filesystem path
- **THEN** the backend rejects the path operation without disclosing host filesystem contents

### Requirement: Recoverable task lifecycle
The system SHALL expose enough persisted task, import, chunk, log, diagnostic, and active-work state to recover or retry supported interrupted and failed workflows without corrupting completed results. A failed media import SHALL remove only its managed partial destination and SHALL NOT modify or delete the selected source file.

#### Scenario: Recoverable work is interrupted
- **WHEN** the application restarts or a retryable chunk fails
- **THEN** the user can identify and resume or retry the supported work from its recorded state

#### Scenario: Managed import fails
- **WHEN** cloning or copying a desktop source into managed storage fails
- **THEN** the task fails with an import-stage diagnostic, its incomplete destination is removed, and the original source remains unchanged
