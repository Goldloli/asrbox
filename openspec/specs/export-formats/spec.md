# export-formats Specification

## Purpose
TBD - created by archiving change normalize-project-documentation. Update Purpose after archive.
## Requirements
### Requirement: Supported export formats
ASRbox SHALL export transcript content in TXT, SRT, VTT, ASS, JSON, and Markdown using the current transcript segments and the semantics appropriate to each format.

#### Scenario: User exports a completed transcript
- **WHEN** a supported format is requested for a valid completed task
- **THEN** the system produces an export containing that task's current transcript content

### Requirement: Timed subtitle integrity
Timed subtitle exports SHALL preserve valid segment ordering, timing, text, and supported speaker information from the selected transcript version.

#### Scenario: Transcript contains timed speaker segments
- **WHEN** the user exports SRT, VTT, or ASS
- **THEN** the rendered cues remain ordered and represent the selected segments without substituting another version

### Requirement: Historical version export
The system SHALL allow supported export formats to be rendered from an immutable historical transcript version without first restoring it over the current transcript.

#### Scenario: User exports an older version
- **WHEN** a valid historical version and supported format are selected
- **THEN** the export represents that version and identifies version metadata where the format supports it

