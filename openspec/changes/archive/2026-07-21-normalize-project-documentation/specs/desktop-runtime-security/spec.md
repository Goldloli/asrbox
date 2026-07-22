## ADDED Requirements

### Requirement: Loopback desktop backend
The packaged desktop application SHALL start its backend sidecar on `127.0.0.1:17494` and SHALL NOT expose it as a supported LAN or public service.

#### Scenario: Desktop application starts
- **WHEN** Tauri launches the packaged backend
- **THEN** the backend listens on the documented loopback address and the frontend connects to that local service

### Requirement: Process-scoped API token
The desktop runtime SHALL generate and use an in-memory process-scoped API token for protected backend requests without persisting that token as a user credential.

#### Scenario: Protected request lacks the desktop token
- **WHEN** a protected endpoint receives a missing or invalid token in packaged desktop operation
- **THEN** the backend rejects the request without revealing the expected token

### Requirement: Web and desktop boundary
The Web UI SHALL connect only to an already running supported backend and SHALL NOT silently start, expose, or claim to secure a remote backend.

#### Scenario: Web development UI starts
- **WHEN** the Vite Web entrypoint is launched independently
- **THEN** it does not create a sidecar process or widen the backend network binding

### Requirement: Verified media runtime
Packaged desktop media processing SHALL use the resolved bundled ffmpeg and ffprobe artifacts with maintained checksum, license, source, and build records.

#### Scenario: Bundled media binary changes
- **WHEN** ffmpeg or ffprobe is updated for a release
- **THEN** checksums, licensing, source materials, notices, verification, and release assets are updated together
