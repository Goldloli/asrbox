# desktop-runtime-security Specification

## Purpose
规定桌面端运行时安全边界：loopback 后端绑定、进程级 API token、Web 与桌面边界、媒体运行时校验，以及显式的容器安全边界。
## Requirements
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

### Requirement: Explicit container security boundary
Container deployment SHALL remain distinct from the desktop sidecar boundary: it SHALL use explicit operator-controlled host binding and optional fixed API-token configuration without changing the desktop loopback binding or process-scoped token behavior.

#### Scenario: Container support is installed
- **WHEN** the Docker deployment files are added or used
- **THEN** packaged desktop startup still binds to `127.0.0.1:17494` and still uses its generated in-memory API token

#### Scenario: Container is exposed beyond loopback
- **WHEN** an operator changes the container bind address to permit other devices
- **THEN** the documentation warns that ASRbox has no built-in TLS or multi-user authorization and requires an appropriate trusted network or protective proxy

