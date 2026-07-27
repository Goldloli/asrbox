## MODIFIED Requirements

### Requirement: Editable transcript segments

Users SHALL be able to edit supported transcript segment text and structure while retaining finite non-negative timing, valid ordering, and a coherent task-level transcript. Saving edits SHALL persist all segment changes and exactly one immutable `edit` version in one database transaction; a single save action never produces a version per segment, and a version-write failure SHALL leave both current segments and version history unchanged. The bulk update SHALL reject payloads whose segment id set differs from the task's current segments (structural changes use the dedicated create/delete/split/merge endpoints), SHALL reject non-finite timing, and SHALL reject invalid timing (`start < 0` or `end <= start`). Every segment mutation, postprocess, or version restore SHALL reject an active task with a conflict response so the task worker remains the only transcript writer. The task-level flat transcript is a derived read-only projection of the segments; free-form whole-text editing SHALL NOT be offered as a persistence path.

#### Scenario: Segment text is edited

- **WHEN** a user saves a valid segment edit on a terminal task
- **THEN** the current transcript reflects the edit and remains exportable

#### Scenario: Multiple segment edits are saved together

- **WHEN** a user saves staged edits to several segments' text, speaker, or timestamps in one action
- **THEN** all edits and exactly one new `edit` version commit atomically, the task text is recomputed, and exports reflect the saved content

#### Scenario: Version creation fails during save

- **WHEN** creating the immutable edit version fails after segment changes have been staged
- **THEN** the transaction rolls back and neither current segments nor version history changes

#### Scenario: Bulk edit with mismatched segment set

- **WHEN** a bulk save carries a segment id set that differs from the task's current segments
- **THEN** the request fails with a clear client error and no segment or version is written

#### Scenario: Bulk edit with invalid timing

- **WHEN** a bulk save carries NaN, infinity, a negative start, or an end that is not after its start
- **THEN** the request fails as a client error identifying invalid input and no change is persisted

#### Scenario: Edit an active task

- **WHEN** a segment mutation, postprocess, or restore targets an active task
- **THEN** it fails with a conflict response and the worker-owned transcript state remains untouched
