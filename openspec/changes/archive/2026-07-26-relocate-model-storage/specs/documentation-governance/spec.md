## MODIFIED Requirements

### Requirement: Audience-specific documentation
The repository SHALL retain focused user, contributor, security, privacy, release, troubleshooting, legal, licensing, changelog, and release-note documents for their intended audiences rather than replacing them with planning artifacts. Desktop and Docker guidance SHALL document the supported model-storage path, cache, migration, mount, unavailable-location, and recovery behavior owned by those runtimes.

#### Scenario: Product behavior affects users
- **WHEN** an accepted behavior change alters installation, privacy, operation, troubleshooting, or release facts
- **THEN** the owning audience document is updated in the same change as the spec

#### Scenario: Docker operator configures model storage
- **WHEN** a Docker operator wants model data outside the default `/data` volume
- **THEN** Compose comments and maintained Chinese and English documentation show how to bind-mount a host directory, declare its allowed container mount point, understand displayed container paths, preserve permissions, and recover from a missing mount
