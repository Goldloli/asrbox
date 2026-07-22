## ADDED Requirements

### Requirement: Explicit container security boundary
Container deployment SHALL remain distinct from the desktop sidecar boundary: it SHALL use explicit operator-controlled host binding and optional fixed API-token configuration without changing the desktop loopback binding or process-scoped token behavior.

#### Scenario: Container support is installed
- **WHEN** the Docker deployment files are added or used
- **THEN** packaged desktop startup still binds to `127.0.0.1:17494` and still uses its generated in-memory API token

#### Scenario: Container is exposed beyond loopback
- **WHEN** an operator changes the container bind address to permit other devices
- **THEN** the documentation warns that ASRbox has no built-in TLS or multi-user authorization and requires an appropriate trusted network or protective proxy
