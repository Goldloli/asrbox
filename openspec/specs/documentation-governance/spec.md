# documentation-governance Specification

## Purpose
TBD - created by archiving change normalize-project-documentation. Update Purpose after archive.
## Requirements
### Requirement: Behavioral source of truth
Accepted ASRbox product behavior and protected invariants SHALL be maintained in `openspec/specs/`, while proposed behavior SHALL remain in an active OpenSpec change until accepted.

#### Scenario: Developer investigates current behavior
- **WHEN** a developer needs to know what behavior a future change must preserve
- **THEN** the relevant main capability spec is the authoritative prose requirement

### Requirement: Audience-specific documentation
The repository SHALL retain focused user, contributor, security, privacy, release, troubleshooting, legal, licensing, changelog, and release-note documents for their intended audiences rather than replacing them with planning artifacts.

#### Scenario: Product behavior affects users
- **WHEN** an accepted behavior change alters installation, privacy, operation, troubleshooting, or release facts
- **THEN** the owning audience document is updated in the same change as the spec

### Requirement: Executable and generated contracts
Exact commands, API schemas, dependency state, and verification results SHALL be derived from executable configuration, generated output, automated tests, CI, or release evidence rather than duplicated as manually maintained product specifications.

#### Scenario: Backend route changes
- **WHEN** a maintained backend route or response changes
- **THEN** generated OpenAPI, typed consumers, contract tests, and the affected compatibility requirement remain consistent

### Requirement: Historical artifact lifecycle
Completed plans and dated assessments SHALL NOT remain active sources of truth after their current constraints have been migrated; durable history SHALL remain available through Git, OpenSpec archives, release notes, or retained test evidence.

#### Scenario: Legacy planning documents are retired
- **WHEN** every still-current requirement from a completed planning document exists in an accepted spec or owned guide
- **THEN** the superseded planning document may be removed from the working tree

