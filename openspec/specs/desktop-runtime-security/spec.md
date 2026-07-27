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

The desktop runtime SHALL generate and use an in-memory process-scoped API token for protected backend requests without persisting that token as a user credential. The maintained frontend SHALL send this token in an Authorization header and SHALL NOT place it in resource or event-stream URLs. Browser-native resources that cannot attach a header MAY use an in-memory, short-lived ticket restricted to one allowed GET path. A resource ticket SHALL expire after its idle lifetime and SHALL have an absolute non-renewable lifetime; successful Range playback MAY renew only the idle deadline up to that absolute deadline, and the returned `expires_at` SHALL identify the absolute deadline. Authentication query parameters SHALL be removed from the request scope after validation so routine access logs do not record them.

#### Scenario: Protected request lacks the desktop token

- **WHEN** a protected endpoint receives a missing or invalid token in packaged desktop operation
- **THEN** the backend rejects the request without revealing the expected token

#### Scenario: Maintained client loads protected audio

- **WHEN** the desktop client requests a task audio URL for browser-native playback
- **THEN** the URL contains only a short-lived ticket restricted to that audio path and does not contain the process-scoped API token

#### Scenario: Active audio renews ticket idle time

- **WHEN** valid Range playback continues within the ticket idle lifetime
- **THEN** idle validity is renewed without extending the ticket beyond its returned absolute `expires_at`

#### Scenario: Resource ticket reaches absolute expiry

- **WHEN** a ticket is continuously reused until its absolute deadline
- **THEN** later requests are rejected and obtaining a new ticket still requires the full API token

#### Scenario: Sensitive query compatibility path is used

- **WHEN** a legacy client authenticates with a supported query credential
- **THEN** authentication is evaluated before the sensitive parameter is removed from the ASGI query string used by routine access logging

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

### Requirement: WebView-privileged file and URL boundaries

Privileged Tauri commands SHALL NOT let WebView-supplied input decide arbitrary filesystem targets or arbitrary open URLs. Text-file saves SHALL accept a target directory only when it resolves to the system download directory, the application or backend data directories, or a directory previously chosen through a native directory picker and recorded by the Rust side across restarts; any other directory SHALL be rejected with a clear error. File-location reveal SHALL canonicalize an existing target before applying reveal semantics, SHALL reveal a file's parent directory, and SHALL refuse executable bundle directories such as `.app` even when reached through a symbolically linked alias. The WebView SHALL NOT hold a direct JavaScript shell-open capability or broad shell-open configuration; all URL and location opening SHALL go through validated Rust commands.

#### Scenario: Save export into a picker-chosen directory

- **WHEN** the WebView requests a text-file save into a directory the user previously selected via the native directory picker
- **THEN** the save proceeds using the existing sanitized filename and non-overwriting path behavior

#### Scenario: Save into an arbitrary directory is rejected

- **WHEN** the WebView requests a text-file save into a directory outside the allowed set, such as a user LaunchAgents directory
- **THEN** the command fails with a clear error and no file is created

#### Scenario: Reveal an executable bundle is refused

- **WHEN** the WebView requests opening the location of a path that is an executable bundle directory or an alias resolving to one
- **THEN** the command refuses to open it instead of launching the bundle

#### Scenario: WebView has no direct shell-open permission

- **WHEN** JavaScript inside the WebView attempts to invoke the shell plugin open endpoint directly
- **THEN** the capability system denies the call and opening remains possible only through validated Rust commands

### Requirement: Bounded desktop sidecar networking

Desktop health checks, sidecar shutdown requests, and wait loops SHALL have explicit connect and total deadlines. A packaged desktop instance SHALL NOT silently adopt an already-running healthy backend for which it does not own the process token.

#### Scenario: Loopback service accepts a connection but never responds

- **WHEN** desktop startup or shutdown contacts a stalled loopback service
- **THEN** the operation returns a timeout error within its maintained deadline instead of blocking application startup or exit indefinitely

#### Scenario: Another packaged backend is already healthy

- **WHEN** a packaged instance starts while no child is owned but an ASRbox health response is already served on the fixed port
- **THEN** startup reports the conflicting instance instead of returning a newly generated token that cannot authenticate to it

