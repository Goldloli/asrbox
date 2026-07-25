## ADDED Requirements

### Requirement: Editable transcript segments
Users SHALL be able to edit supported transcript segment text and structure while retaining valid ordering and a coherent task-level transcript.

#### Scenario: Segment text is edited
- **WHEN** a user saves a valid segment edit
- **THEN** the current transcript reflects the edit and remains exportable

### Requirement: Immutable transcript versions
Transcription, retranscription, editing, post-processing, and restore operations that change transcript content SHALL create immutable version snapshots rather than rewriting historical versions.

#### Scenario: Transcript is changed
- **WHEN** an operation commits changed transcript content
- **THEN** the prior snapshot remains available and a new auditable version records the resulting content

### Requirement: Auditable restore
Restoring a historical transcript version SHALL copy that version into the current task state and create a new restore version.

#### Scenario: User restores an older version
- **WHEN** a valid historical version is selected for restore
- **THEN** its text and segments become current without deleting or mutating any existing version
