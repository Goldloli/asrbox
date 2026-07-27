# export-formats Specification

## Purpose
规定受支持的字幕导出格式集合、带时间轴字幕的完整性约束，以及历史字幕版本的导出行为。
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

### Requirement: Safe batch archive entries

Every file entry in a batch export ZIP SHALL use a sanitized leaf filename derived from the user media name, a task identifier, and a fixed supported extension. User-controlled separators, traversal components, control characters, absolute-path prefixes, and platform drive syntax SHALL NOT create archive directories or extraction targets.

#### Scenario: Task filename contains traversal syntax

- **WHEN** a completed task named with `../`, backslashes, absolute-path text, control characters, or an empty stem is included in a batch export
- **THEN** each ZIP member remains a non-empty leaf filename inside the archive and retains the correct task id and format extension

