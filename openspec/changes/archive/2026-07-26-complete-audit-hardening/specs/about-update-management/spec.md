## ADDED Requirements

### Requirement: Bounded update transport waits

Application-update metadata, checksum, and installer HTTP operations SHALL use explicit connection and response deadlines. A large installer MAY download for an unbounded total duration while data continues to arrive, but waiting for the next body chunk SHALL have an idle timeout and cancellation SHALL remain observable.

#### Scenario: Installer server stalls mid-download

- **WHEN** an installer response stops yielding body data beyond the maintained idle timeout
- **THEN** the partial file is removed, the update reports a recoverable timeout, and transcription and other application work remain available

#### Scenario: Slow download continues making progress

- **WHEN** installer chunks continue arriving within the idle timeout even though total transfer time is long
- **THEN** the download continues, reports progress, and is not failed solely for exceeding a fixed total duration
