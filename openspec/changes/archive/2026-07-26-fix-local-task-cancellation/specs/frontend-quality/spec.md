## ADDED Requirements

### Requirement: Active task stop control
The primary transcription workspace SHALL provide an accessible, confirmed stop control for the selected active transcription and SHALL prevent duplicate cancellation requests while the action is pending.

#### Scenario: User stops a task from the transcription workspace
- **WHEN** the selected task is queued or running and the user confirms the stop action
- **THEN** the interface requests cancellation, refreshes active task state, and reports success or a diagnosable error
