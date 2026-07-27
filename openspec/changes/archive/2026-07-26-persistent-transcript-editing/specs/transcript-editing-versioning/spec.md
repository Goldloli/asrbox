# transcript-editing-versioning Specification Delta

## MODIFIED Requirements

### Requirement: Editable transcript segments
Users SHALL be able to edit supported transcript segment text and structure while retaining valid ordering and a coherent task-level transcript. Saving edits SHALL persist them to the backend as one atomic bulk segment update that creates exactly one immutable `edit` version; a single save action never produces a version per segment. The bulk update SHALL reject payloads whose segment id set differs from the task's current segments (structural changes use the dedicated create/delete/split/merge endpoints) and SHALL reject invalid timing (`start < 0` or `end <= start`). The task-level flat transcript is a derived read-only projection of the segments; free-form whole-text editing SHALL NOT be offered as a persistence path.

#### Scenario: Segment text is edited
- **WHEN** a user saves a valid segment edit
- **THEN** the current transcript reflects the edit and remains exportable

#### Scenario: Multiple segment edits are saved together
- **WHEN** a user saves staged edits to several segments' text, speaker, or timestamps in one action
- **THEN** all edits persist atomically, the task text is recomputed, exactly one new `edit` version is recorded, and exports reflect the saved content

#### Scenario: Bulk edit with mismatched segment set
- **WHEN** a bulk save carries a segment id set that differs from the task's current segments
- **THEN** the request fails with a clear client error and no segment or version is written

#### Scenario: Bulk edit with invalid timing
- **WHEN** a bulk save carries a segment whose timing is negative or whose end is not after its start
- **THEN** the request fails identifying the offending segment and no change is persisted
