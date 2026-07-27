## ADDED Requirements

### Requirement: Safe batch archive entries

Every file entry in a batch export ZIP SHALL use a sanitized leaf filename derived from the user media name, a task identifier, and a fixed supported extension. User-controlled separators, traversal components, control characters, absolute-path prefixes, and platform drive syntax SHALL NOT create archive directories or extraction targets.

#### Scenario: Task filename contains traversal syntax

- **WHEN** a completed task named with `../`, backslashes, absolute-path text, control characters, or an empty stem is included in a batch export
- **THEN** each ZIP member remains a non-empty leaf filename inside the archive and retains the correct task id and format extension
