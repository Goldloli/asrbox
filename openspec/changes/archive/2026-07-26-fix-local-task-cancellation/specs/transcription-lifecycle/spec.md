## ADDED Requirements

### Requirement: Cancellable local execution
ASRbox SHALL terminate the active local inference execution when its task is cancelled, SHALL NOT persist a cancelled result, and SHALL release the local worker so subsequent queued tasks can continue without restarting the application.

#### Scenario: User cancels a running local task
- **WHEN** a local transcription is inside model inference and the user confirms cancellation
- **THEN** the inference process terminates, the task remains cancelled without transcript output, and the next queued local task can start

### Requirement: Work-based local progress
ASRbox SHALL derive local transcription progress from lifecycle stages and completed bounded audio chunks rather than incrementing a percentage solely from elapsed wall-clock time.

#### Scenario: Local inference is slower than expected
- **WHEN** a local model spends an extended period processing the current audio chunk
- **THEN** the interface does not advance to an invented near-complete percentage and later progress advances when bounded work completes

### Requirement: Accelerated Transformers selection
On a supported runtime, Transformers Whisper SHALL use an available maintained acceleration device before falling back to CPU and SHALL expose failures instead of silently reporting acceleration that was not used.

#### Scenario: Apple MPS is available
- **WHEN** Transformers Whisper starts on a compatible Apple Silicon desktop runtime
- **THEN** the model pipeline selects MPS rather than forcing CPU execution
